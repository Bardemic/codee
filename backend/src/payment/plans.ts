/**
 * Payment plan definitions and pricing configuration
 */

import { SubscriptionTier } from '../db/entities/Organization';

export interface PlanConfig {
    tier: SubscriptionTier;
    name: string;
    description: string;
    messageLimit: number;
    tokenCostLimitMicrodollars: number;
    priceMonthly: number; // in cents
    stripePriceId?: string;
}

export const PLANS: Record<SubscriptionTier, PlanConfig> = {
    [SubscriptionTier.FREE]: {
        tier: SubscriptionTier.FREE,
        name: 'Free',
        description: 'Perfect for trying out Codee',
        messageLimit: 10,
        tokenCostLimitMicrodollars: 5_000_000, // $5.00
        priceMonthly: 0,
    },
    [SubscriptionTier.PAID]: {
        tier: SubscriptionTier.PAID,
        name: 'Paid',
        description: 'For regular Codee users',
        messageLimit: 100,
        tokenCostLimitMicrodollars: 20_000_000, // $20.00
        priceMonthly: 2000, // $20.00
        stripePriceId: process.env.STRIPE_PRICE_ID_PAID,
    },
};

export function getPlanConfig(tier: SubscriptionTier): PlanConfig {
    return PLANS[tier];
}

export function getMessageLimit(tier: SubscriptionTier): number {
    return PLANS[tier].messageLimit;
}

export function getTokenCostLimitMicrodollars(tier: SubscriptionTier): number {
    return PLANS[tier].tokenCostLimitMicrodollars;
}
