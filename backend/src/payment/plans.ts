/**
 * Payment plan definitions and pricing configuration
 */

import { SubscriptionTier } from '../db/entities/Organization';

export interface PlanPerk {
    name: string;
    included: boolean;
}

export interface PlanConfig {
    tier: SubscriptionTier;
    name: string;
    description: string;
    tokenCostLimitMicrodollars: number;
    sandboxTimeLimitSeconds: number;
    priceMonthly: number; // in cents
    stripePriceId?: string;
    perks: PlanPerk[];
}

export const PLANS: Record<SubscriptionTier, PlanConfig> = {
    [SubscriptionTier.FREE]: {
        tier: SubscriptionTier.FREE,
        name: 'Lite',
        description: 'Try out Codee without committing',
        tokenCostLimitMicrodollars: 5_000_000, // $5.00
        sandboxTimeLimitSeconds: 7200, // 1 hour
        priceMonthly: 0,
        perks: [
            { name: '$2.00 included LLM tokens', included: true },
            { name: '2 hours of agent runtime', included: true },
            { name: 'Slack Bot', included: true },
            { name: 'Priority support', included: false },
            { name: 'Acess to premium LLM models', included: false },
            { name: 'First access to new features', included: false },
            { name: 'Add members to your organization', included: false },
        ],
    },
    [SubscriptionTier.PAID]: {
        tier: SubscriptionTier.PAID,
        name: 'Pro',
        description: 'For developers who need higher limits',
        tokenCostLimitMicrodollars: 20_000_000, // $20.00
        sandboxTimeLimitSeconds: 86400, // 24 hours
        priceMonthly: 2000, // $20.00
        stripePriceId: process.env.STRIPE_PRICE_ID_PAID,
        perks: [
            { name: '$20.00 included LLM tokens', included: true },
            { name: '24 hours of agent runtime', included: true },
            { name: 'Slack Bot', included: true },
            { name: 'Priority support', included: true },
            { name: 'Acess to premium LLM models', included: true },
            { name: 'First access to new features', included: true },
            { name: 'Add members to your organization', included: false },
        ],
    },
    [SubscriptionTier.ENTERPRISE]: {
        tier: SubscriptionTier.ENTERPRISE,
        name: 'Enterprise',
        description: 'Custom solutions for teams and organizations',
        tokenCostLimitMicrodollars: -1,
        sandboxTimeLimitSeconds: -1,
        priceMonthly: -1,
        perks: [
            { name: 'Custom LLM token limits', included: true },
            { name: 'Custom agent runtime', included: true },
            { name: 'Custom member limits', included: true },
            { name: 'Dedicated Slack channel', included: true },
            { name: 'Custom features and integrations', included: true },
            { name: '...and more!', included: true },
        ],
    },
};

export function getPlanConfig(tier: SubscriptionTier): PlanConfig {
    return PLANS[tier];
}

export function getTokenCostLimitMicrodollars(tier: SubscriptionTier): number {
    return PLANS[tier].tokenCostLimitMicrodollars;
}

export function getSandboxTimeLimitSeconds(tier: SubscriptionTier): number {
    return PLANS[tier].sandboxTimeLimitSeconds;
}
