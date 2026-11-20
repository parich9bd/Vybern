import { UserRole } from '@prisma/client';

export const adminPermissions = [
  'DASHBOARD_READ', 'PRODUCT_MANAGE', 'INVENTORY_MANAGE', 'ORDER_READ', 'ORDER_MANAGE',
  'CUSTOMER_READ', 'PAYMENT_READ', 'SETTINGS_MANAGE', 'ADMIN_MANAGE',
] as const;
export type AdminPermission = (typeof adminPermissions)[number];

const allPermissions = new Set<AdminPermission>(adminPermissions);
const permissionsByRole: Record<UserRole, ReadonlySet<AdminPermission>> = {
  CUSTOMER: new Set(),
  SUPER_ADMIN: allPermissions,
  ADMIN: new Set(adminPermissions.filter((permission) => permission !== 'ADMIN_MANAGE')),
  STAFF: new Set(['PRODUCT_MANAGE', 'INVENTORY_MANAGE', 'ORDER_READ', 'ORDER_MANAGE']),
  SUPPORT: new Set(['ORDER_READ', 'CUSTOMER_READ', 'PAYMENT_READ']),
};

export function hasAdminPermission(role: UserRole, permission: AdminPermission): boolean {
  return permissionsByRole[role].has(permission);
}
