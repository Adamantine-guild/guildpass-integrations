'use client'

import { useAccount } from 'wagmi'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { getBillingApi } from '@/lib/billing'
import { queryKeys } from '@/lib/query'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { getApi } from '@/lib/api'
import { useSiweAuth } from '@/lib/wallet/providers'
import Link from 'next/link'
import { 
  CreditCard, 
  AlertTriangle, 
  CheckCircle, 
  HelpCircle, 
  ArrowLeft, 
  Plus, 
  Trash2, 
  Download, 
  RefreshCw,
  Info,
  ShieldCheck
} from 'lucide-react'

// Helper to format currency (USD cents)
function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount / 100)
}

// Helper to format date
function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export default function BillingPage() {
  const { address, isConnected } = useAccount()
  const { authSession } = useSiweAuth()
  const queryClient = useQueryClient()
  
  // Read active community cookie or default to guildpass-demo
  const [activeCommunity, setActiveCommunity] = useState('guildpass-demo')
  const [activeCommunityName, setActiveCommunityName] = useState('GuildPass Demo')

  useEffect(() => {
    const match = document.cookie.match(/gp-active-community=([^;]+)/)
    if (match && match[1]) {
      setActiveCommunity(match[1])
      // Set readable name
      const names: Record<string, string> = {
        'guildpass-demo': 'GuildPass Demo',
        'builders-collective': 'Builders Collective',
        'design-guild': 'Design Guild',
        'guildpass-hub': 'GuildPass Hub'
      }
      setActiveCommunityName(names[match[1]] || match[1])
    }
  }, [])

  // Initialize Billing API Client
  const billingApi = getBillingApi(address, authSession?.token, activeCommunity)

  // Fetch Current Subscription
  const { 
    data: subscription, 
    isLoading: isSubLoading,
    refetch: refetchSubscription 
  } = useQuery({
    queryKey: queryKeys.billing.subscription(address ?? '', activeCommunity),
    queryFn: () => billingApi.getCurrentSubscription(),
    enabled: !!address,
  })

  // Fetch Available Plans
  const { 
    data: plans, 
    isLoading: isPlansLoading 
  } = useQuery({
    queryKey: queryKeys.billing.plans(activeCommunity),
    queryFn: () => billingApi.listAvailablePlans(),
  })

  // Fetch Payment Methods
  const { 
    data: paymentMethods, 
    isLoading: isPmLoading,
    refetch: refetchPm 
  } = useQuery({
    queryKey: queryKeys.billing.paymentMethods(address ?? '', activeCommunity),
    queryFn: () => billingApi.listPaymentMethods(),
    enabled: !!address,
  })

  // Fetch Invoices
  const { 
    data: invoices, 
    isLoading: isInvoicesLoading,
    refetch: refetchInvoices 
  } = useQuery({
    queryKey: queryKeys.billing.invoices(address ?? '', activeCommunity),
    queryFn: () => billingApi.listInvoices(),
    enabled: !!address,
  })

  // Mutation: Upgrade/Downgrade Plan
  const planMutation = useMutation({
    mutationFn: (planId: string) => billingApi.upgradeOrDowngradePlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription(address ?? '', activeCommunity) })
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.invoices(address ?? '', activeCommunity) })
      queryClient.invalidateQueries({ queryKey: queryKeys.session.byAddress(address ?? '', activeCommunity) })
      setConfirmPlan(null)
    }
  })

  // Mutation: Cancel Subscription
  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription(address ?? '', activeCommunity) })
      queryClient.invalidateQueries({ queryKey: queryKeys.session.byAddress(address ?? '', activeCommunity) })
      setShowCancelConfirm(false)
    }
  })

  // Mutation: Reactivate Subscription
  const reactivateMutation = useMutation({
    mutationFn: () => billingApi.reactivateSubscription(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription(address ?? '', activeCommunity) })
      queryClient.invalidateQueries({ queryKey: queryKeys.session.byAddress(address ?? '', activeCommunity) })
    }
  })

  // Mutation: Add Payment Method
  const addPmMutation = useMutation({
    mutationFn: (newPm: { brand: string; last4: string; expMonth: number; expYear: number }) => 
      billingApi.addPaymentMethod(newPm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentMethods(address ?? '', activeCommunity) })
      setIsAddingCard(false)
      // Reset form
      setCardName('')
      setCardBrand('Visa')
      setCardLast4('')
      setCardExpMonth('12')
      setCardExpYear('2028')
    }
  })

  // Mutation: Set Default Payment Method
  const setDefaultPmMutation = useMutation({
    mutationFn: (id: string) => billingApi.updateDefaultPaymentMethod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentMethods(address ?? '', activeCommunity) })
    }
  })

  // Mutation: Delete Payment Method
  const deletePmMutation = useMutation({
    mutationFn: (id: string) => billingApi.deletePaymentMethod(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.paymentMethods(address ?? '', activeCommunity) })
    }
  })

  // Mutation: Simulator controls
  const simulatorMutation = useMutation({
    mutationFn: async (state: 'none' | 'failed_payment' | 'retry_pending' | 'warning' | 'past_due' | 'canceled' | 'success') => {
      if (state === 'success') {
        await billingApi.simulatePaymentSuccess()
      } else {
        await billingApi.simulateDunningState(state as any)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.subscription(address ?? '', activeCommunity) })
      queryClient.invalidateQueries({ queryKey: queryKeys.billing.invoices(address ?? '', activeCommunity) })
      queryClient.invalidateQueries({ queryKey: queryKeys.session.byAddress(address ?? '', activeCommunity) })
    }
  })

  // Local state for modals/confirmations
  const [confirmPlan, setConfirmPlan] = useState<string | null>(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)
  const [isAddingCard, setIsAddingCard] = useState(false)

  // Card input states
  const [cardName, setCardName] = useState('')
  const [cardBrand, setCardBrand] = useState('Visa')
  const [cardLast4, setCardLast4] = useState('')
  const [cardExpMonth, setCardExpMonth] = useState('12')
  const [cardExpYear, setCardExpYear] = useState('2028')

  // Find plan details
  const currentPlan = plans?.find(p => p.id === subscription?.planId)

  // Handle plan selection (upgrade/downgrade confirmation)
  const handleSelectPlan = (planId: string) => {
    if (!subscription) return
    if (subscription.planId === planId) return
    setConfirmPlan(planId)
  }

  const handleAddCard = (e: React.FormEvent) => {
    e.preventDefault()
    if (!cardLast4 || cardLast4.length !== 4 || isNaN(Number(cardLast4))) {
      alert('Please enter a valid 4-digit card number')
      return
    }
    addPmMutation.mutate({
      brand: cardBrand,
      last4: cardLast4,
      expMonth: Number(cardExpMonth),
      expYear: Number(cardExpYear),
    })
  }

  // Render wallet connection check
  if (!isConnected || !address) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-zinc-400 dark:text-zinc-600 mb-4" />
        <h1 className="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-50">Billing & Subscriptions</h1>
        <p className="mt-2 text-muted-foreground max-w-md mx-auto">
          Please connect your Web3 wallet to manage subscriptions, view billing history, and configure payment methods.
        </p>
        <div className="mt-6">
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-zinc-100 dark:border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href={`/${activeCommunity}/dashboard`} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-xs font-medium text-zinc-500">{activeCommunityName}</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-700 dark:from-zinc-50 dark:to-zinc-400 bg-clip-text text-transparent">
            Billing & Subscriptions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage your community membership tiers, default cards, and view payment receipt history.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="px-2.5 py-1 text-xs bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 mr-1" /> Mock Billing Active
          </Badge>
        </div>
      </div>

      {/* Simulator Control Drawer / Panel */}
      <Card className="border-indigo-100 dark:border-indigo-950 bg-indigo-50/50 dark:bg-indigo-950/20 overflow-hidden">
        <CardHeader className="py-4 px-6 border-b border-indigo-100/50 dark:border-indigo-950/50">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-400">
              <RefreshCw className="h-4 w-4 animate-spin-slow" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold text-indigo-900 dark:text-indigo-300">Developer Billing Simulator</CardTitle>
              <CardDescription className="text-xs text-indigo-700/80 dark:text-indigo-400/80">
                Simulate various payment processor and webhook failure states to verify the UX dunning flows.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="py-4 px-6">
          <div className="flex flex-wrap gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white hover:bg-zinc-50 border-zinc-200 text-xs"
              onClick={() => simulatorMutation.mutate('none')}
            >
              Normal Active
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white hover:bg-zinc-50 border-zinc-200 text-amber-600 border-amber-200 hover:bg-amber-50 hover:text-amber-700 text-xs"
              onClick={() => simulatorMutation.mutate('failed_payment')}
            >
              Simulate Failed Payment (Retry Pending)
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white hover:bg-zinc-50 border-zinc-200 text-orange-600 border-orange-200 hover:bg-orange-50 hover:text-orange-700 text-xs"
              onClick={() => simulatorMutation.mutate('retry_pending')}
            >
              Simulate Temporary Retry Block
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white hover:bg-zinc-50 border-zinc-200 text-rose-600 border-rose-200 hover:bg-rose-50 hover:text-rose-700 text-xs"
              onClick={() => simulatorMutation.mutate('past_due')}
            >
              Simulate Past Due (Access at Risk)
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="bg-white hover:bg-zinc-50 border-zinc-200 text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 text-xs"
              onClick={() => simulatorMutation.mutate('canceled')}
            >
              Simulate Access Revocation (Canceled)
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs border-0"
              onClick={() => simulatorMutation.mutate('success')}
            >
              Simulate Payment Success / Clear Failure
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* First-Class Dunning Alert States */}
      {subscription && subscription.status !== 'canceled' && subscription.dunningStatus !== 'none' && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-amber-900 dark:text-amber-300 text-sm">
                {subscription.dunningStatus === 'failed_payment' && 'Payment failed — retry pending'}
                {subscription.dunningStatus === 'retry_pending' && 'Payment retry in progress'}
                {subscription.dunningStatus === 'warning' && 'Access warning — billing issue'}
              </h4>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Your payment of {currentPlan ? formatCurrency(currentPlan.price) : '—'} for the {currentPlan?.name} was declined. 
                {subscription.status === 'past_due' ? (
                  <span className="font-bold block mt-1">Your community membership benefits are currently suspended or set to degrade until payment is resolved.</span>
                ) : (
                  <span> We will automatically retry the card on file. Please check your payment methods to prevent service degradation.</span>
                )}
              </p>
              <div className="pt-2 flex gap-2">
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="bg-white hover:bg-amber-100/50 text-amber-900 border-amber-300 text-xs"
                  onClick={() => simulatorMutation.mutate('success')}
                  disabled={simulatorMutation.isPending}
                >
                  {simulatorMutation.isPending ? 'Processing...' : 'Retry Payment Now'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dunning: Subscription Suspended/Canceled State */}
      {subscription && subscription.status === 'canceled' && (
        <div className="rounded-lg border border-red-200 dark:border-red-950 bg-red-50 dark:bg-red-950/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="font-semibold text-red-900 dark:text-red-300 text-sm">Subscription Cancelled / Suspended</h4>
              <p className="text-xs text-red-700 dark:text-red-400">
                Your standard/pro subscription has expired or was canceled due to unpaid invoices. Your membership benefits have been downgraded to the Free Tier.
              </p>
              <div className="pt-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  className="bg-white hover:bg-red-100/50 text-red-900 border-red-300 text-xs"
                  onClick={() => handleSelectPlan('standard')}
                >
                  Re-Subscribe Standard ($15/mo)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Current Subscription Status & Available Plans */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left 2 Columns: Subscription Status / Plans Comparison */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Active Subscription Summary Card */}
          <Card className="overflow-hidden border border-zinc-200 dark:border-zinc-800">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">Subscription Overview</CardTitle>
                  <CardDescription className="text-xs">Your active subscription tier details</CardDescription>
                </div>
                {subscription && (
                  <Badge variant={subscription.status === 'active' ? 'success' : subscription.status === 'past_due' ? 'warning' : 'destructive'}>
                    {subscription.status.toUpperCase()}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {isSubLoading ? (
                <div className="space-y-3 py-2">
                  <div className="h-4 bg-zinc-150 dark:bg-zinc-800 rounded animate-pulse w-1/3"></div>
                  <div className="h-4 bg-zinc-150 dark:bg-zinc-800 rounded animate-pulse w-1/2"></div>
                </div>
              ) : subscription ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Plan Tier</span>
                      <p className="text-2xl font-bold mt-0.5 text-zinc-900 dark:text-zinc-100">{currentPlan?.name ?? 'Free Tier'}</p>
                    </div>
                    <div>
                      <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Price</span>
                      <p className="text-lg font-semibold mt-0.5">
                        {currentPlan ? `${formatCurrency(currentPlan.price)} / ${currentPlan.interval}` : '$0.00 / month'}
                      </p>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <div>
                      <span className="text-xs text-muted-foreground uppercase font-semibold tracking-wider">Renewal Date</span>
                      <p className="text-sm font-medium mt-0.5">
                        {subscription.status === 'active' || subscription.status === 'past_due' ? (
                          <>
                            {formatDate(subscription.currentPeriodEnd)}
                            {subscription.cancelAtPeriodEnd ? (
                              <span className="text-xs text-red-500 font-normal block mt-1">Cancels at the end of billing cycle</span>
                            ) : null}
                          </>
                        ) : 'N/A'}
                      </p>
                    </div>
                    
                    {/* Cancellation & Reactivation Buttons */}
                    <div className="pt-2">
                      {subscription.planId !== 'free' && subscription.status !== 'canceled' && (
                        <>
                          {subscription.cancelAtPeriodEnd ? (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={() => reactivateMutation.mutate()}
                              disabled={reactivateMutation.isPending}
                            >
                              {reactivateMutation.isPending ? 'Processing...' : 'Reactivate Autorenewal'}
                            </Button>
                          ) : (
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20"
                              onClick={() => setShowCancelConfirm(true)}
                            >
                              Cancel Auto-Renewal
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No subscription found.</p>
              )}
            </CardContent>
          </Card>

          {/* Cancellation Confirmation Step (Friction) */}
          {showCancelConfirm && (
            <Card className="border-red-200 dark:border-red-950 bg-red-50/50 dark:bg-red-950/10">
              <CardHeader>
                <CardTitle className="text-md text-red-900 dark:text-red-400 flex items-center gap-1.5">
                  <AlertTriangle className="h-5 w-5" /> Cancel Subscription Renewal
                </CardTitle>
                <CardDescription className="text-xs text-red-700 dark:text-red-400">
                  Are you absolutely sure you want to cancel your autorenewal? Let's check the details first.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-red-800 dark:text-red-400">
                  By canceling, you will lose access to premium resources such as the **Alpha Docs**, and you will no longer receive priority support. You will retain standard access until the end of your billing period on **{subscription ? formatDate(subscription.currentPeriodEnd) : ''}**, after which your account will fall back to the Free Tier.
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    variant="destructive"
                    onClick={() => cancelMutation.mutate()}
                    disabled={cancelMutation.isPending}
                  >
                    {cancelMutation.isPending ? 'Processing...' : 'Yes, Cancel Autorenewal'}
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="bg-white text-zinc-950 border-zinc-200"
                    onClick={() => setShowCancelConfirm(false)}
                  >
                    Keep Subscription
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Upgrade / Downgrade Plan Options */}
          <div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-4">Membership Plans & Tier Selection</h3>
            {isPlansLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-48 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded-lg"></div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {plans?.map((plan) => {
                  const isCurrent = subscription?.planId === plan.id
                  const isUpgrade = subscription && (
                    (subscription.planId === 'free' && plan.id !== 'free') ||
                    (subscription.planId === 'standard' && plan.id === 'pro')
                  )
                  
                  return (
                    <Card 
                      key={plan.id}
                      className={`relative flex flex-col justify-between border-2 transition-all hover:shadow-md ${
                        isCurrent 
                          ? 'border-indigo-600 dark:border-indigo-400 shadow-sm' 
                          : 'border-zinc-200 dark:border-zinc-800/80'
                      }`}
                    >
                      {isCurrent && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 dark:bg-indigo-400 text-white dark:text-zinc-950 text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full shadow-sm">
                          Current Plan
                        </div>
                      )}
                      
                      <CardHeader className="pt-6">
                        <h4 className="font-extrabold text-md text-zinc-900 dark:text-zinc-100">{plan.name}</h4>
                        <div className="mt-2 flex items-baseline">
                          <span className="text-3xl font-extrabold tracking-tight">
                            {formatCurrency(plan.price)}
                          </span>
                          <span className="ml-1 text-xs text-muted-foreground">/{plan.interval}</span>
                        </div>
                        <CardDescription className="text-xs mt-3 min-h-[40px] leading-relaxed">
                          {plan.description}
                        </CardDescription>
                      </CardHeader>
                      
                      <CardContent className="pb-6 pt-0 flex-1 flex flex-col justify-between">
                        <ul className="text-xs space-y-2 mb-6 text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800/80 pt-4">
                          {plan.features.map((feat, index) => (
                            <li key={index} className="flex items-start gap-1.5">
                              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                              <span>{feat}</span>
                            </li>
                          ))}
                        </ul>
                        
                        <Button
                          className="w-full text-xs font-semibold"
                          variant={isCurrent ? 'outline' : isUpgrade ? 'default' : 'secondary'}
                          disabled={isCurrent || planMutation.isPending}
                          onClick={() => handleSelectPlan(plan.id)}
                        >
                          {isCurrent ? 'Current Plan' : isUpgrade ? 'Upgrade' : 'Downgrade'}
                        </Button>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>

          {/* Plan Change Confirmation Dialog (Friction) */}
          {confirmPlan && (
            <Card className="border-indigo-200 dark:border-indigo-950 bg-indigo-50/30 dark:bg-indigo-950/10">
              <CardHeader>
                <CardTitle className="text-md text-indigo-900 dark:text-indigo-300">
                  Confirm Subscription Change
                </CardTitle>
                <CardDescription className="text-xs text-indigo-700/80 dark:text-indigo-400/80">
                  You are changing your subscription tier to the **{plans?.find(p => p.id === confirmPlan)?.name}**.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  Your new billing amount will be **{formatCurrency(plans?.find(p => p.id === confirmPlan)?.price ?? 0)}** charged immediately. 
                  Your next renewal cycle starts today, and any premium access benefits will adjust immediately.
                </p>
                <div className="flex gap-2">
                  <Button 
                    size="sm"
                    onClick={() => planMutation.mutate(confirmPlan)}
                    disabled={planMutation.isPending}
                  >
                    {planMutation.isPending ? 'Processing...' : 'Confirm Change'}
                  </Button>
                  <Button 
                    size="sm"
                    variant="outline"
                    className="bg-white text-zinc-950 border-zinc-200"
                    onClick={() => setConfirmPlan(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Right 1 Column: Payment Methods & Add Card & Invoice History */}
        <div className="space-y-6">
          
          {/* Payment Method Management */}
          <Card className="border border-zinc-200 dark:border-zinc-800">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-sm font-bold">Payment Methods</CardTitle>
                <CardDescription className="text-[11px]">Manage credit cards for renewal billing</CardDescription>
              </div>
              {!isAddingCard && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 px-2 text-xs" 
                  onClick={() => setIsAddingCard(true)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {isAddingCard ? (
                <form onSubmit={handleAddCard} className="space-y-3 border border-indigo-100 dark:border-indigo-950 bg-indigo-50/20 dark:bg-indigo-950/10 p-3 rounded-lg">
                  <div className="text-[11px] font-semibold text-indigo-900 dark:text-indigo-400 uppercase tracking-wide mb-1">
                    Add Mock Card (No PCI Scope)
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="brand" className="text-[10px] text-muted-foreground uppercase font-bold">Card Brand</Label>
                    <select 
                      id="brand"
                      value={cardBrand}
                      onChange={(e) => setCardBrand(e.target.value)}
                      className="w-full text-xs rounded border border-input bg-background px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring"
                    >
                      <option value="Visa">Visa</option>
                      <option value="Mastercard">Mastercard</option>
                      <option value="Amex">American Express</option>
                      <option value="Discover">Discover</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="last4" className="text-[10px] text-muted-foreground uppercase font-bold">Last 4 Digits</Label>
                    <Input 
                      id="last4"
                      value={cardLast4}
                      onChange={(e) => setCardLast4(e.target.value.slice(0, 4))}
                      placeholder="4242"
                      maxLength={4}
                      className="h-8 text-xs"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label htmlFor="expMonth" className="text-[10px] text-muted-foreground uppercase font-bold">Exp Month</Label>
                      <select 
                        id="expMonth"
                        value={cardExpMonth}
                        onChange={(e) => setCardExpMonth(e.target.value)}
                        className="w-full text-xs rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1"
                      >
                        {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="expYear" className="text-[10px] text-muted-foreground uppercase font-bold">Exp Year</Label>
                      <select 
                        id="expYear"
                        value={cardExpYear}
                        onChange={(e) => setCardExpYear(e.target.value)}
                        className="w-full text-xs rounded border border-input bg-background px-2 py-1 focus:outline-none focus:ring-1"
                      >
                        {Array.from({ length: 10 }, (_, i) => String(2026 + i)).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button type="submit" size="sm" disabled={addPmMutation.isPending} className="text-xs">
                      {addPmMutation.isPending ? 'Adding...' : 'Save Card'}
                    </Button>
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setIsAddingCard(false)}
                      className="text-xs bg-white text-zinc-950"
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : null}

              {/* Payment Methods List */}
              {isPmLoading ? (
                <div className="space-y-2">
                  <div className="h-10 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded"></div>
                </div>
              ) : paymentMethods && paymentMethods.length > 0 ? (
                <div className="space-y-2">
                  {paymentMethods.map((pm) => (
                    <div 
                      key={pm.id}
                      className={`flex items-center justify-between p-3 rounded-lg border text-xs ${
                        pm.isDefault 
                          ? 'border-indigo-200 dark:border-indigo-950 bg-indigo-50/10 dark:bg-indigo-950/5' 
                          : 'border-zinc-200 dark:border-zinc-800/80'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400">
                          <CreditCard className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {pm.brand} •••• {pm.last4}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            Expires {pm.expMonth}/{pm.expYear}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {pm.isDefault ? (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border-emerald-200">
                            Default
                          </Badge>
                        ) : (
                          <>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-[10px] h-6 px-1.5 text-zinc-500 hover:text-zinc-800"
                              onClick={() => setDefaultPmMutation.mutate(pm.id)}
                            >
                              Set Default
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-red-500 hover:text-red-600 hover:bg-red-50 h-6 w-6 p-0"
                              onClick={() => deletePmMutation.mutate(pm.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No payment methods on file.</p>
              )}
            </CardContent>
          </Card>

          {/* Invoice Receipt History */}
          <Card className="border border-zinc-200 dark:border-zinc-800">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold">Billing History</CardTitle>
              <CardDescription className="text-[11px]">View and download past invoice receipts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {isInvoicesLoading ? (
                <div className="space-y-2">
                  <div className="h-8 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded"></div>
                  <div className="h-8 bg-zinc-100 dark:bg-zinc-800 animate-pulse rounded"></div>
                </div>
              ) : invoices && invoices.length > 0 ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {invoices.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0 text-xs">
                      <div>
                        <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                          {formatCurrency(inv.amount)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatDate(inv.date)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          variant="outline" 
                          className={`text-[9px] px-1.5 py-0 uppercase ${
                            inv.status === 'paid' 
                              ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-950/20' 
                              : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-950/20'
                          }`}
                        >
                          {inv.status}
                        </Badge>
                        {inv.status === 'paid' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 w-6 p-0 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                            asChild
                          >
                            <a href="#" onClick={(e) => { e.preventDefault(); alert('Downloading mock invoice PDF'); }}>
                              <Download className="h-3.5 w-3.5 text-zinc-500" />
                            </a>
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">No payment history found.</p>
              )}
            </CardContent>
          </Card>

        </div>

      </div>
    </div>
  )
}
