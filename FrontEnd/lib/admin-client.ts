import { authenticatedRequest } from './auth-client';

export type AdminDashboard = { metrics: { realRevenueMinor: number; mockRevenueMinor: number; totalOrders: number; pendingOrders: number; cancelledOrders: number; totalCustomers: number; activeProducts: number; lowStockProducts: number }; recentOrders: Array<{ id: string; status: string; total: { amountMinor: number; currency: string }; createdAt: string; customer: { firstName: string | null; lastName: string | null } }>; topSellingProducts: Array<{ productId: string | null; name: string; quantity: number }>; revenueTrends: { real: Array<{ date: string; amountMinor: number }>; mock: Array<{ date: string; amountMinor: number }> } };

export async function getAdminDashboard(): Promise<AdminDashboard> { return (await authenticatedRequest<{ data: AdminDashboard }>('/admin/dashboard')).data; }
export async function getAdminMe(): Promise<{ id: string; firstName: string | null; lastName: string | null; role: string }> { return (await authenticatedRequest<{ data: { id: string; firstName: string | null; lastName: string | null; role: string } }>('/admin/me')).data; }
