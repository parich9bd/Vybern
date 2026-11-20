export interface SmsProvider {
  deliverOtp(phone: string, code: string): Promise<{ developmentCode?: string }>;
}

export class DevelopmentSmsProvider implements SmsProvider {
  async deliverOtp(_phone: string, code: string): Promise<{ developmentCode: string }> {
    // Deliberately returned only from development flows; never logged or used in production.
    return { developmentCode: code };
  }
}

export class UnconfiguredSmsProvider implements SmsProvider {
  async deliverOtp(): Promise<never> {
    throw new Error('SMS delivery is not configured');
  }
}
