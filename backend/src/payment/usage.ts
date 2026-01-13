/**
 * Message usage tracking and limit enforcement
 */

import { AppDataSource } from '../db/data-source';
import { Organization, SubscriptionTier } from '../db/entities/Organization';
import { getMessageLimit } from './plans';

/**
 * Check if organization can send more messages
 */
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

    // Check if billing period needs to be reset
    await resetBillingPeriodIfNeeded(organization);

    const current = organization.messageCount;
    const limit = organization.messageLimit;

    if (current >= limit) {
        return {
            allowed: false,
            reason: `Message limit reached. You've used ${current}/${limit} messages this billing period.`,
            current,
            limit,
        };
    }

    return {
        allowed: true,
        current,
        limit,
    };
}

/**
 * Increment message count for organization
 */
export async function incrementMessageCount(organizationId: number): Promise<void> {
    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.increment({ id: organizationId }, 'messageCount', 1);
}

/**
 * Reset billing period if current period has ended
 */
export async function resetBillingPeriodIfNeeded(organization: Organization): Promise<void> {
    const now = new Date();

    // If no billing period set, initialize it
    if (!organization.billingPeriodStart || !organization.billingPeriodEnd) {
        await initializeBillingPeriod(organization);
        return;
    }

    // If billing period has ended, reset it
    if (now >= organization.billingPeriodEnd) {
        await resetBillingPeriod(organization);
    }
}

/**
 * Initialize billing period for a new organization
 */
async function initializeBillingPeriod(organization: Organization): Promise<void> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.update(organization.id, {
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
        messageCount: 0,
    });

    // Update the in-memory object
    organization.billingPeriodStart = now;
    organization.billingPeriodEnd = periodEnd;
    organization.messageCount = 0;
}

/**
 * Reset billing period and message count
 */
async function resetBillingPeriod(organization: Organization): Promise<void> {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.update(organization.id, {
        billingPeriodStart: now,
        billingPeriodEnd: periodEnd,
        messageCount: 0,
    });

    // Update the in-memory object
    organization.billingPeriodStart = now;
    organization.billingPeriodEnd = periodEnd;
    organization.messageCount = 0;
}

/**
 * Update organization subscription tier and limits
 */
export async function updateSubscriptionTier(organizationId: number, tier: SubscriptionTier): Promise<void> {
    const messageLimit = getMessageLimit(tier);

    const organizationRepo = AppDataSource.getRepository(Organization);
    await organizationRepo.update(organizationId, {
        subscriptionTier: tier,
        messageLimit,
    });
}

/**
 * Get organization usage stats
 */
export async function getUsageStats(organizationId: number): Promise<{
    messageCount: number;
    messageLimit: number;
    billingPeriodStart?: Date;
    billingPeriodEnd?: Date;
    percentUsed: number;
}> {
    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { id: organizationId },
    });

    if (!organization) {
        throw new Error('Organization not found');
    }

    await resetBillingPeriodIfNeeded(organization);

    const percentUsed = organization.messageLimit > 0 ? (organization.messageCount / organization.messageLimit) * 100 : 0;

    return {
        messageCount: organization.messageCount,
        messageLimit: organization.messageLimit,
        billingPeriodStart: organization.billingPeriodStart,
        billingPeriodEnd: organization.billingPeriodEnd,
        percentUsed: Math.round(percentUsed),
    };
}
