import { OrderStatus, PaymentProvider, PaymentStatus, PrismaClient, ProductStatus } from '@prisma/client';

type RevenueRow = { day: Date; revenue: bigint | number };
type StockRow = { count: bigint | number };

function asNumber(value: bigint | number): number { return typeof value === 'bigint' ? Number(value) : value; }

export class DashboardService {
  constructor(private readonly prisma: PrismaClient) {}

  async overview(from: Date, to: Date, recentLimit: number) {
    const orderRange = { createdAt: { gte: from, lte: to } };
    const paidReal = { ...orderRange, payment: { provider: PaymentProvider.ZARINPAL, status: PaymentStatus.SUCCEEDED } };
    const paidMock = { ...orderRange, payment: { provider: PaymentProvider.MOCK, status: PaymentStatus.SUCCEEDED } };
    const [realRevenue, mockRevenue, totalOrders, pendingOrders, cancelledOrders, totalCustomers, activeProducts, lowStock, recentOrders, revenueRows, mockRevenueRows, topProducts] = await Promise.all([
      this.prisma.order.aggregate({ where: paidReal, _sum: { totalMinor: true } }),
      this.prisma.order.aggregate({ where: paidMock, _sum: { totalMinor: true } }),
      this.prisma.order.count({ where: orderRange }),
      this.prisma.order.count({ where: { ...orderRange, status: OrderStatus.PENDING_PAYMENT } }),
      this.prisma.order.count({ where: { ...orderRange, status: OrderStatus.CANCELLED } }),
      this.prisma.user.count({ where: { role: 'CUSTOMER' } }),
      this.prisma.product.count({ where: { status: ProductStatus.ACTIVE } }),
      this.prisma.$queryRaw<StockRow[]>`
        SELECT COUNT(*)::bigint AS count FROM "ProductVariant" v
        INNER JOIN "Product" p ON p.id = v."productId"
        WHERE p.status = 'ACTIVE' AND v."isActive" = true AND v."stockOnHand" - v."stockReserved" <= 5
      `,
      this.prisma.order.findMany({
        where: orderRange, orderBy: { createdAt: 'desc' }, take: recentLimit,
        include: { user: { select: { id: true, firstName: true, lastName: true } }, payment: { select: { provider: true, status: true } } },
      }),
      this.prisma.$queryRaw<RevenueRow[]>`
        SELECT DATE_TRUNC('day', o."createdAt") AS day, COALESCE(SUM(o."totalMinor"), 0)::bigint AS revenue
        FROM "Order" o INNER JOIN "Payment" p ON p."orderId" = o.id
        WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND p.provider = 'ZARINPAL' AND p.status = 'SUCCEEDED'
        GROUP BY DATE_TRUNC('day', o."createdAt") ORDER BY day ASC
      `,
      this.prisma.$queryRaw<RevenueRow[]>`
        SELECT DATE_TRUNC('day', o."createdAt") AS day, COALESCE(SUM(o."totalMinor"), 0)::bigint AS revenue
        FROM "Order" o INNER JOIN "Payment" p ON p."orderId" = o.id
        WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND p.provider = 'MOCK' AND p.status = 'SUCCEEDED'
        GROUP BY DATE_TRUNC('day', o."createdAt") ORDER BY day ASC
      `,
      this.prisma.$queryRaw<Array<{ productId: string | null; productName: string; quantity: bigint | number }>>`
        SELECT i."productId", i."productName", SUM(i.quantity)::bigint AS quantity
        FROM "OrderItem" i INNER JOIN "Order" o ON o.id = i."orderId" INNER JOIN "Payment" p ON p."orderId" = o.id
        WHERE o."createdAt" >= ${from} AND o."createdAt" <= ${to} AND p.provider = 'ZARINPAL' AND p.status = 'SUCCEEDED'
        GROUP BY i."productId", i."productName" ORDER BY quantity DESC LIMIT 10
      `,
    ]);
    return {
      data: {
        range: { from: from.toISOString(), to: to.toISOString() },
        metrics: {
          realRevenueMinor: realRevenue._sum.totalMinor ?? 0,
          mockRevenueMinor: mockRevenue._sum.totalMinor ?? 0,
          totalOrders, pendingOrders, cancelledOrders, totalCustomers, activeProducts, lowStockProducts: asNumber(lowStock[0]?.count ?? 0),
        },
        recentOrders: recentOrders.map((order) => ({
          id: order.id, status: order.status, total: { amountMinor: order.totalMinor, currency: order.currency }, createdAt: order.createdAt.toISOString(),
          customer: { id: order.user.id, firstName: order.user.firstName, lastName: order.user.lastName },
          payment: order.payment,
        })),
        topSellingProducts: topProducts.map((product) => ({ productId: product.productId, name: product.productName, quantity: asNumber(product.quantity) })),
        revenueTrends: {
          real: revenueRows.map((row) => ({ date: row.day.toISOString(), amountMinor: asNumber(row.revenue) })),
          mock: mockRevenueRows.map((row) => ({ date: row.day.toISOString(), amountMinor: asNumber(row.revenue) })),
        },
      },
    };
  }
}
