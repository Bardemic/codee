import { AppDataSource } from '../db/data-source';
import { Organization, SubscriptionTier } from '../db/entities/Organization';
import { getMessageLimit, getTokenCostLimitMicrodollars } from './plans';
import { microdollarsToDollars } from './model-pricing';

export async function canSendMessage(organizationId: number): Promise<{
    allowed: boolean;
    reason?: string;
    current: number;
    limit: number;
}> {
    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { id: organizationId },
    });

    if (!organization) {
        return {
            allowed: false,
            reason: 'Organization not found',
            current: 0,
            limit: 0,
        };
    }

    await resetBillingPeriodIfNeeded(organization);

    const messageCount = organization.messageCount;
    const messageLimit = organization.messageLimit;
    const costUsedMicrodollars = organization.tokenCostUsedMicrodollars;
    const costLimitMicrodollars = organization.tokenCostLimitMicrodollars;

    if (messageCount >= messageLimit) {
        return {
            allowed: false,
            reason: `Message limit reached. You've used ${messageCount}/${messageLimit} messages this billing period.`,
            current: messageCount,
            limit: messageLimit,
        };
    }

    if (costUsedMicrodollars >= costLimitMicrodollars) {
        const costUsedDollars = microdollarsToDollars(costUsedMicrodollars);
        const costLimitDollars = microdollarsToDollars(costLimitMicrodollars);
        return {
            allowed: false,
            reason: `Cost limit reached. You've used $${costUsedDollars.toFixed(2)}/$${costLimitDollars.toFixed(2)} this billing period.`,
            current: messageCount,
            limit: messageLimit,
        };
    }

    return {
        allowed: true,
        current: messageCount,
        limit: messageLimit,
    };
}

export async function incrementMessageCount(organizationId: number): Promise<void> {
    await AppDataSource.getRepository(Organization).increment({ id: organizationId }, 'messageCount', 1);
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
            messageCount: 0,
            tokenCostUsedMicrodollars: 0,
        });

        organization.billingPeriodStart = now;
        organization.billingPeriodEnd = periodEnd;
        organization.messageCount = 0;
        organization.tokenCostUsedMicrodollars = 0;
    }
}

export async function updateSubscriptionTier(organizationId: number, tier: SubscriptionTier): Promise<void> {
    const messageLimit = getMessageLimit(tier);
    const tokenCostLimitMicrodollars = getTokenCostLimitMicrodollars(tier);

    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.update(organizationId, {
        subscriptionTier: tier,
        messageLimit,
        tokenCostLimitMicrodollars,
    });
}

export async function getUsageStats(organizationId: number): Promise<{
    messageCount: number;
    messageLimit: number;
    tokenCostUsedMicrodollars: number;
    tokenCostLimitMicrodollars: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    messagePercentUsed: number;
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

    const messagePercentUsed = (organization.messageCount / organization.messageLimit) * 100;
    const costPercentUsed = (organization.tokenCostUsedMicrodollars / organization.tokenCostLimitMicrodollars) * 100;

    return {
        messageCount: organization.messageCount,
        messageLimit: organization.messageLimit,
        tokenCostUsedMicrodollars: organization.tokenCostUsedMicrodollars,
        tokenCostLimitMicrodollars: organization.tokenCostLimitMicrodollars,
        billingPeriodStart: organization.billingPeriodStart,
        billingPeriodEnd: organization.billingPeriodEnd,
        messagePercentUsed: Math.round(messagePercentUsed),
        costPercentUsed: Math.round(costPercentUsed),
    };
}
