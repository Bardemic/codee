import { AppDataSource } from '../db/data-source';
import { Organization, SubscriptionTier } from '../db/entities/Organization';
import { getTokenCostLimitMicrodollars } from './plans';
import { microdollarsToDollars } from './model-pricing';

export async function canSendMessage(organizationId: number): Promise<{
    allowed: boolean;
    reason?: string;
}> {
    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { id: organizationId },
    });

    if (!organization) {
        return {
            allowed: false,
            reason: 'Organization not found',
        };
    }

    await resetBillingPeriodIfNeeded(organization);

    const costUsedMicrodollars = organization.tokenCostUsedMicrodollars;
    const costLimitMicrodollars = organization.tokenCostLimitMicrodollars;

    if (costUsedMicrodollars >= costLimitMicrodollars) {
        const costUsedDollars = microdollarsToDollars(costUsedMicrodollars);
        const costLimitDollars = microdollarsToDollars(costLimitMicrodollars);
        return {
            allowed: false,
            reason: `Cost limit reached. You've used $${costUsedDollars.toFixed(2)}/$${costLimitDollars.toFixed(2)} this billing period.`,
        };
    }

    return {
        allowed: true,
    };
}

export async function incrementTokenCostMicrodollars(organizationId: number, costMicrodollars: number): Promise<void> {
    if (costMicrodollars <= 0) {
        return;
    }
    await AppDataSource.getRepository(Organization).increment({ id: organizationId }, 'tokenCostUsedMicrodollars', costMicrodollars);
}

export async function resetBillingPeriodIfNeeded(organization: Organization): Promise<void> {
    // Paid tier billing is managed by Stripe webhooks
    if (organization.subscriptionTier === SubscriptionTier.PAID) {
        return;
    }

    const now = new Date();
    if (now >= organization.billingPeriodEnd) {
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const organizationRepo = AppDataSource.getRepository(Organization);
        await organizationRepo.update(organization.id, {
            billingPeriodStart: now,
            billingPeriodEnd: periodEnd,
            tokenCostUsedMicrodollars: 0,
        });

        organization.billingPeriodStart = now;
        organization.billingPeriodEnd = periodEnd;
        organization.tokenCostUsedMicrodollars = 0;
    }
}

export async function updateSubscriptionTier(organizationId: number, tier: SubscriptionTier): Promise<void> {
    const tokenCostLimitMicrodollars = getTokenCostLimitMicrodollars(tier);

    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.update(organizationId, {
        subscriptionTier: tier,
        tokenCostLimitMicrodollars,
    });
}

export async function getUsageStats(organizationId: number): Promise<{
    tokenCostUsedMicrodollars: number;
    tokenCostLimitMicrodollars: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    costPercentUsed: number;
}> {
    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { id: organizationId },
    });

    if (!organization) {
        throw new Error('Organization not found');
    }

    await resetBillingPeriodIfNeeded(organization);

    const costPercentUsed = (organization.tokenCostUsedMicrodollars / organization.tokenCostLimitMicrodollars) * 100;

    return {
        tokenCostUsedMicrodollars: organization.tokenCostUsedMicrodollars,
        tokenCostLimitMicrodollars: organization.tokenCostLimitMicrodollars,
        billingPeriodStart: organization.billingPeriodStart,
        billingPeriodEnd: organization.billingPeriodEnd,
        costPercentUsed: Math.round(costPercentUsed),
    };
}
