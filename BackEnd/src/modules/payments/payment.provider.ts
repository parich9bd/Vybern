import { randomUUID } from 'node:crypto';
import type { PaymentProvider as PaymentProviderName } from '@prisma/client';

export type PaymentRequest = { amountMinor: number; currency: string; expiresAt: Date };
export type ProviderPaymentRequest = { provider: PaymentProviderName; providerReference: string };

export interface PaymentProvider {
  createPayment(request: PaymentRequest): Promise<ProviderPaymentRequest>;
}

export class MockPaymentProvider implements PaymentProvider {
  async createPayment(): Promise<ProviderPaymentRequest> {
    return { provider: 'MOCK', providerReference: `mock_${randomUUID()}` };
  }
}

export class UnconfiguredPaymentProvider implements PaymentProvider {
  async createPayment(): Promise<never> {
    throw new Error('Payment provider is not configured');
  }
}
