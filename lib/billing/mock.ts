import { 
  BillingApi, 
  BillingSubscription, 
  BillingPlan, 
  PaymentMethod, 
  BillingInvoice, 
  SubscriptionStatus, 
  DunningStatus 
} from './types';
import { getCommunityState } from '../api/mock';

const LS_BILLING_KEY = 'guildpass-mock-billing-state';

const AVAILABLE_PLANS: BillingPlan[] = [
  {
    id: 'free',
    name: 'Free Tier',
    price: 0,
    interval: 'month',
    description: 'Basic community access with essential features.',
    features: ['Access to general community areas', 'Basic profile verification', 'Standard public resources'],
  },
  {
    id: 'standard',
    name: 'Standard Tier',
    price: 1500, // $15.00
    interval: 'month',
    description: 'For active members wanting full community access.',
    features: ['Access to Alpha Docs', 'All community channels', 'Priority support', 'Exclusive Standard Badges'],
  },
  {
    id: 'pro',
    name: 'Pro Tier',
    price: 3000, // $30.00
    interval: 'month',
    description: 'The ultimate tier for developers, moderators, and VIPs.',
    features: ['Unlimited resource access', 'Pro-only channels', 'Direct support channels', 'Custom profile badges', 'Developer tools access'],
  },
];

interface AccountBillingState {
  subscription: BillingSubscription;
  paymentMethods: PaymentMethod[];
  invoices: BillingInvoice[];
}

export class MockBillingApi implements BillingApi {
  readonly address?: string;
  readonly communityId: string;

  constructor(address?: string, communityId?: string) {
    this.address = address;
    this.communityId = communityId ?? 'guildpass-demo';
  }

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private getStorageKey(): string {
    return `${this.address ?? 'anonymous'}:${this.communityId}`;
  }

  private loadAllStates(): Record<string, AccountBillingState> {
    if (!this.isBrowser()) return {};
    try {
      const data = localStorage.getItem(LS_BILLING_KEY);
      return data ? JSON.parse(data) : {};
    } catch {
      return {};
    }
  }

  private saveAllStates(states: Record<string, AccountBillingState>) {
    if (!this.isBrowser()) return;
    try {
      localStorage.setItem(LS_BILLING_KEY, JSON.stringify(states));
    } catch {}
  }

  private getOrCreateState(): AccountBillingState {
    const key = this.getStorageKey();
    const allStates = this.loadAllStates();

    if (allStates[key]) {
      return allStates[key];
    }

    // Determine tier from mock API memberStore
    let tier: 'free' | 'standard' | 'pro' = 'free';
    let isActive = true;
    if (this.address) {
      try {
        const commState = getCommunityState(this.communityId);
        const member = commState.memberStore[this.address];
        if (member && member.membership) {
          tier = member.membership.tier;
          isActive = member.membership.active;
        }
      } catch {}
    }

    const defaultSubscription: BillingSubscription = {
      id: `sub_${Math.random().toString(36).substr(2, 9)}`,
      status: isActive ? (tier === 'free' ? 'active' : 'active') : 'canceled',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      cancelAtPeriodEnd: false,
      planId: tier,
      dunningStatus: 'none',
    };

    const defaultPaymentMethods: PaymentMethod[] = [
      {
        id: 'pm_1',
        brand: 'Visa',
        last4: '4242',
        expMonth: 12,
        expYear: 2028,
        isDefault: true,
      },
    ];

    const defaultInvoices: BillingInvoice[] = tier === 'free' ? [] : [
      {
        id: `in_1`,
        amount: tier === 'pro' ? 3000 : 1500,
        currency: 'usd',
        status: 'paid',
        date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        downloadUrl: '#',
      },
    ];

    const newState = {
      subscription: defaultSubscription,
      paymentMethods: defaultPaymentMethods,
      invoices: defaultInvoices,
    };

    allStates[key] = newState;
    this.saveAllStates(allStates);
    return newState;
  }

  private updateState(updater: (state: AccountBillingState) => void) {
    const key = this.getStorageKey();
    const allStates = this.loadAllStates();
    const state = allStates[key] || this.getOrCreateState();
    updater(state);
    allStates[key] = state;
    this.saveAllStates(allStates);

    // Sync state back to the mock memberStore
    if (this.address) {
      try {
        const commState = getCommunityState(this.communityId);
        const member = commState.memberStore[this.address];
        if (member && member.membership) {
          member.membership.tier = state.subscription.planId as any;
          // Active if not canceled, or if in dunning warning (past_due)
          member.membership.active = state.subscription.status !== 'canceled' && state.subscription.status !== 'unpaid';
          
          // Trigger mock API save by setting timestamp or dummy change to run storage persistence
          // Since the mock api uses schedulePersist when mutations happen, we can also dispatch an event or write directly
          localStorage.setItem('guildpass-mock-state-trigger', Date.now().toString());
        }
      } catch {}
    }
  }

  async getCurrentSubscription(_signal?: AbortSignal): Promise<BillingSubscription | null> {
    return this.getOrCreateState().subscription;
  }

  async listAvailablePlans(_signal?: AbortSignal): Promise<BillingPlan[]> {
    return AVAILABLE_PLANS;
  }

  async upgradeOrDowngradePlan(planId: string, _signal?: AbortSignal): Promise<BillingSubscription> {
    const plan = AVAILABLE_PLANS.find(p => p.id === planId);
    if (!plan) throw new Error('Invalid plan ID');

    let updatedSub!: BillingSubscription;
    this.updateState((state) => {
      state.subscription.planId = planId;
      state.subscription.status = 'active';
      state.subscription.dunningStatus = 'none';
      state.subscription.cancelAtPeriodEnd = false;
      state.subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      
      // If paid, create invoice
      if (plan.price > 0) {
        state.invoices.unshift({
          id: `in_${Math.random().toString(36).substr(2, 9)}`,
          amount: plan.price,
          currency: 'usd',
          status: 'paid',
          date: new Date().toISOString(),
          downloadUrl: '#',
        });
      }
      updatedSub = state.subscription;
    });

    return updatedSub;
  }

  async cancelSubscription(_signal?: AbortSignal): Promise<BillingSubscription> {
    let updatedSub!: BillingSubscription;
    this.updateState((state) => {
      state.subscription.cancelAtPeriodEnd = true;
      updatedSub = state.subscription;
    });
    return updatedSub;
  }

  async reactivateSubscription(_signal?: AbortSignal): Promise<BillingSubscription> {
    let updatedSub!: BillingSubscription;
    this.updateState((state) => {
      state.subscription.cancelAtPeriodEnd = false;
      updatedSub = state.subscription;
    });
    return updatedSub;
  }

  async listPaymentMethods(_signal?: AbortSignal): Promise<PaymentMethod[]> {
    return this.getOrCreateState().paymentMethods;
  }

  async addPaymentMethod(pm: Omit<PaymentMethod, 'id' | 'isDefault'>, _signal?: AbortSignal): Promise<PaymentMethod> {
    const newPm: PaymentMethod = {
      ...pm,
      id: `pm_${Math.random().toString(36).substr(2, 9)}`,
      isDefault: false,
    };

    this.updateState((state) => {
      if (state.paymentMethods.length === 0) {
        newPm.isDefault = true;
      }
      state.paymentMethods.push(newPm);
    });

    return newPm;
  }

  async updateDefaultPaymentMethod(id: string, _signal?: AbortSignal): Promise<void> {
    this.updateState((state) => {
      state.paymentMethods = state.paymentMethods.map(pm => ({
        ...pm,
        isDefault: pm.id === id,
      }));
    });
  }

  async deletePaymentMethod(id: string, _signal?: AbortSignal): Promise<void> {
    this.updateState((state) => {
      const pmToDelete = state.paymentMethods.find(pm => pm.id === id);
      state.paymentMethods = state.paymentMethods.filter(pm => pm.id !== id);
      
      // If deleted default, assign a new default if options exist
      if (pmToDelete?.isDefault && state.paymentMethods.length > 0) {
        state.paymentMethods[0].isDefault = true;
      }
    });
  }

  async listInvoices(_signal?: AbortSignal): Promise<BillingInvoice[]> {
    return this.getOrCreateState().invoices;
  }

  async simulateDunningState(state: DunningStatus | 'past_due' | 'canceled', _signal?: AbortSignal): Promise<void> {
    this.updateState((s) => {
      if (state === 'failed_payment') {
        s.subscription.status = 'active';
        s.subscription.dunningStatus = 'failed_payment';
      } else if (state === 'retry_pending') {
        s.subscription.status = 'active';
        s.subscription.dunningStatus = 'retry_pending';
      } else if (state === 'warning') {
        s.subscription.status = 'active';
        s.subscription.dunningStatus = 'warning';
      } else if (state === 'past_due') {
        s.subscription.status = 'past_due';
        s.subscription.dunningStatus = 'failed_payment';
        
        // Add a failed invoice
        s.invoices.unshift({
          id: `in_fail_${Math.random().toString(36).substr(2, 9)}`,
          amount: s.subscription.planId === 'pro' ? 3000 : 1500,
          currency: 'usd',
          status: 'open',
          date: new Date().toISOString(),
        });
      } else if (state === 'canceled') {
        s.subscription.status = 'canceled';
        s.subscription.dunningStatus = 'none';
        s.subscription.planId = 'free'; // fall back to free plan
      } else {
        s.subscription.status = 'active';
        s.subscription.dunningStatus = 'none';
      }
    });
  }

  async simulatePaymentSuccess(_signal?: AbortSignal): Promise<void> {
    this.updateState((state) => {
      state.subscription.status = 'active';
      state.subscription.dunningStatus = 'none';
      
      const plan = AVAILABLE_PLANS.find(p => p.id === state.subscription.planId) || AVAILABLE_PLANS[0];
      
      // Update any open invoices to paid
      state.invoices = state.invoices.map(inv => {
        if (inv.status === 'open') {
          return { ...inv, status: 'paid' as const, downloadUrl: '#' };
        }
        return inv;
      });

      // Add a fresh paid invoice as success representation
      if (plan.price > 0) {
        state.invoices.unshift({
          id: `in_${Math.random().toString(36).substr(2, 9)}`,
          amount: plan.price,
          currency: 'usd',
          status: 'paid',
          date: new Date().toISOString(),
          downloadUrl: '#',
        });
      }
    });
  }
}
