import { authenticatedRequest } from './auth-client';

export type ServiceRequestResult = { data: { reference: string; status: 'PENDING' } };

export async function submitServiceRequest(path: 'eye-exam' | 'lens-upgrade', payload: Record<string, string>, idempotencyKey: string): Promise<ServiceRequestResult> {
  return authenticatedRequest<ServiceRequestResult>(`/service-requests/${path}`, {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey },
    body: JSON.stringify(payload),
  });
}
