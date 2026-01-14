import { AppDataSource } from '../db/data-source';
import { Organization, SubscriptionTier } from '../db/entities/Organization';
import { getTokenCostLimitMicrodollars, getSandboxTimeLimitSeconds } from './plans';
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

export async function canUseSandbox(organizationId: number): Promise<{
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

    const timeUsedSeconds = organization.sandboxTimeUsedSeconds;
    const timeLimitSeconds = organization.sandboxTimeLimitSeconds;

    if (timeUsedSeconds >= timeLimitSeconds) {
        const timeUsedMinutes = Math.floor(timeUsedSeconds / 60);
        const timeLimitMinutes = Math.floor(timeLimitSeconds / 60);
        return {
            allowed: false,
            reason: `Sandbox time limit reached. You've used ${timeUsedMinutes} minutes / ${timeLimitMinutes} minutes this billing period.`,
        };
    }

    return {
        allowed: true,
    };
}

export async function incrementSandboxTimeSeconds(organizationId: number, seconds: number): Promise<void> {
    if (seconds <= 0) {
        return;
    }
    await AppDataSource.getRepository(Organization).increment({ id: organizationId }, 'sandboxTimeUsedSeconds', seconds);
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
            sandboxTimeUsedSeconds: 0,
        });

        organization.billingPeriodStart = now;
        organization.billingPeriodEnd = periodEnd;
        organization.tokenCostUsedMicrodollars = 0;
        organization.sandboxTimeUsedSeconds = 0;
    }
}

export async function updateSubscriptionTier(organizationId: number, tier: SubscriptionTier): Promise<void> {
    const tokenCostLimitMicrodollars = getTokenCostLimitMicrodollars(tier);
    const sandboxTimeLimitSeconds = getSandboxTimeLimitSeconds(tier);

    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.update(organizationId, {
        subscriptionTier: tier,
        tokenCostLimitMicrodollars,
        sandboxTimeLimitSeconds,
    });
}

export async function getUsageStats(organizationId: number): Promise<{
    tokenCostUsedMicrodollars: number;
    tokenCostLimitMicrodollars: number;
    sandboxTimeUsedSeconds: number;
    sandboxTimeLimitSeconds: number;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    costPercentUsed: number;
    sandboxTimePercentUsed: number;
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
    const sandboxTimePercentUsed = (organization.sandboxTimeUsedSeconds / organization.sandboxTimeLimitSeconds) * 100;

    return {
        tokenCostUsedMicrodollars: organization.tokenCostUsedMicrodollars,
        tokenCostLimitMicrodollars: organization.tokenCostLimitMicrodollars,
        sandboxTimeUsedSeconds: organization.sandboxTimeUsedSeconds,
        sandboxTimeLimitSeconds: organization.sandboxTimeLimitSeconds,
        billingPeriodStart: organization.billingPeriodStart,
        billingPeriodEnd: organization.billingPeriodEnd,
        costPercentUsed: Math.round(costPercentUsed),
        sandboxTimePercentUsed: Math.round(sandboxTimePercentUsed),
    };
}
