import { AuthApiError, authenticatedRequest, getCsrfToken, type AuthUser } from './auth-client';

export type CustomerProfile = AuthUser & Readonly<{ status: string; createdAt: string }>;
export type CustomerAddress = Readonly<{ id: string; firstName: string; lastName: string; phone: string; addressLine1: string; addressLine2: string | null; city: string; province: string; postalCode: string; isDefault: boolean; createdAt: string; updatedAt: string }>;
export type AddressInput = Readonly<{ firstName: string; lastName: string; phone: string; addressLine1: string; addressLine2?: string; city: string; province: string; postalCode: string; isDefault?: boolean }>;
export type CustomerOrder = Readonly<{ id: string; status: string; currency: string; subtotal: Money; discount: Money; shipping: Money; total: Money; shippingAddress: OrderAddress | null; items: OrderItem[]; createdAt: string; reservationExpiresAt: string | null; shippingMethod: string | null; deliveryEstimateDays: number | null }>;
export type CustomerPayment = Readonly<{ id: string; orderId: string; status: string; amount: Money; verifiedAt: string | null; expiresAt: string | null; createdAt: string }>;
type Money = Readonly<{ amountMinor: number; currency: string }>;
type OrderAddress = Readonly<{ firstName: string; lastName: string; phone: string; addressLine1: string; addressLine2: string | null; city: string; region: string | null; postalCode: string; countryCode: string }>;
type OrderItem = Readonly<{ id: string; quantity: number; product: { id: string | null; slug: string; sku: string; name: string }; variant: { id: string | null; sku: string; name: string; colour: string | null }; unitPrice: Money; lineTotal: Money }>;

function csrfHeaders(): HeadersInit {
  const token = getCsrfToken();
  if (!token) throw new AuthApiError('CSRF_MISSING', 'Session verification is unavailable', 403);
  return { 'x-csrf-token': token };
}

export async function getProfile(): Promise<CustomerProfile> {
  return (await authenticatedRequest<{ data: CustomerProfile }>('/account/profile')).data;
}

export async function updateProfile(input: { firstName?: string; lastName?: string }): Promise<CustomerProfile> {
  await authenticatedRequest('/account/profile', { method: 'PATCH', headers: csrfHeaders(), body: JSON.stringify(input) });
  return getProfile();
}

export async function getOrders(): Promise<CustomerOrder[]> {
  return (await authenticatedRequest<{ data: CustomerOrder[] }>('/orders?limit=50')).data;
}

export async function getOrder(orderId: string): Promise<CustomerOrder> {
  return (await authenticatedRequest<{ data: CustomerOrder }>(`/orders/${encodeURIComponent(orderId)}`)).data;
}

export async function getPayments(): Promise<CustomerPayment[]> {
  return (await authenticatedRequest<{ data: CustomerPayment[] }>('/account/payments?limit=100')).data;
}

export async function getAddresses(): Promise<CustomerAddress[]> {
  return (await authenticatedRequest<{ data: CustomerAddress[] }>('/account/addresses')).data;
}

export async function saveAddress(input: AddressInput, addressId?: string): Promise<CustomerAddress> {
  const path = addressId ? `/account/addresses/${encodeURIComponent(addressId)}` : '/account/addresses';
  const method = addressId ? 'PATCH' : 'POST';
  const { addressLine2, ...required } = input;
  const payload = { ...required, ...(addressLine2?.trim() ? { addressLine2: addressLine2.trim() } : {}) };
  return (await authenticatedRequest<{ data: CustomerAddress }>(path, { method, headers: csrfHeaders(), body: JSON.stringify(payload) })).data;
}

export async function deleteAddress(addressId: string): Promise<void> {
  await authenticatedRequest(`/account/addresses/${encodeURIComponent(addressId)}`, { method: 'DELETE', headers: csrfHeaders() });
}

export async function uploadAvatar(file: File): Promise<string> {
  const csrfToken = getCsrfToken();
  if (!csrfToken) throw new AuthApiError('CSRF_MISSING', 'Session verification is unavailable', 403);
  const form = new FormData(); form.append('avatar', file);
  return (await authenticatedRequest<{ data: { avatarUrl: string } }>('/account/avatar', { method: 'POST', headers: { 'x-csrf-token': csrfToken }, body: form })).data.avatarUrl;
}

export async function removeAvatar(): Promise<void> {
  await authenticatedRequest('/account/avatar', { method: 'DELETE', headers: csrfHeaders() });
}
