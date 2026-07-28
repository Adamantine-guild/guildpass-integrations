import { z } from 'zod';

export type SubscriptionStatus = 'active' | 'past_due' | 'unpaid' | 'canceled' | 'paused' | 'incomplete';
export type DunningStatus = 'none' | 'failed_payment' | 'retry_pending' | 'warning';
export type InvoiceStatus = 'paid' | 'open' | 'uncollectible' | 'void';

export interface BillingPlan {
  id: string;
  name: string;
  price: number; // in USD cents (e.g. 1500 for $15.00)
  interval: 'month' | 'year';
  description: string;
  features: string[];
}

export interface BillingSubscription {
  id: string;
  status: SubscriptionStatus;
  currentPeriodEnd: string; // ISO date string
  cancelAtPeriodEnd: boolean;
  planId: string;
  dunningStatus: DunningStatus;
}

export interface PaymentMethod {
  id: string;
  brand: string; // Visa, Mastercard, etc.
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export interface BillingInvoice {
  id: string;
  amount: number; // in USD cents
  currency: string; // e.g. 'usd'
  status: InvoiceStatus;
  date: string; // ISO date string
  downloadUrl?: string;
}

export interface BillingApi {
  getCurrentSubscription(signal?: AbortSignal): Promise<BillingSubscription | null>;
  listAvailablePlans(signal?: AbortSignal): Promise<BillingPlan[]>;
  upgradeOrDowngradePlan(planId: string, signal?: AbortSignal): Promise<BillingSubscription>;
  cancelSubscription(signal?: AbortSignal): Promise<BillingSubscription>;
  reactivateSubscription(signal?: AbortSignal): Promise<BillingSubscription>;
  listPaymentMethods(signal?: AbortSignal): Promise<PaymentMethod[]>;
  addPaymentMethod(paymentMethod: Omit<PaymentMethod, 'id' | 'isDefault'>, signal?: AbortSignal): Promise<PaymentMethod>;
  updateDefaultPaymentMethod(id: string, signal?: AbortSignal): Promise<void>;
  deletePaymentMethod(id: string, signal?: AbortSignal): Promise<void>;
  listInvoices(signal?: AbortSignal): Promise<BillingInvoice[]>;
  simulateDunningState(state: DunningStatus | 'past_due' | 'canceled', signal?: AbortSignal): Promise<void>;
  simulatePaymentSuccess(signal?: AbortSignal): Promise<void>;
}
