import { AppDataSource } from '../db/data-source';
import { Subscription, SubscriptionTier } from '../db/entities/Subscription';
import { Message } from '../db/entities/Message';
import { autumnClient } from './autumnClient';
import { MoreThanOrEqual } from 'typeorm';

// Plan limits
export const PLAN_LIMITS = {
    [SubscriptionTier.FREE]: 10,
    [SubscriptionTier.PAID]: 100,
};

// Autumn product IDs (these should match your Autumn dashboard configuration)
const AUTUMN_PRODUCT_IDS = {
    [SubscriptionTier.PAID]: process.env.AUTUMN_PAID_PRODUCT_ID || 'paid',
};

/**
 * Get or create subscription for an organization
 */
export async function getOrCreateSubscription(organizationId: number): Promise<Subscription> {
    const subscriptionRepo = AppDataSource.getRepository(Subscription);

    let subscription = await subscriptionRepo.findOne({
        where: { organizationId },
    });

    if (!subscription) {
        subscription = subscriptionRepo.create({
            organizationId,
            tier: SubscriptionTier.FREE,
            isActive: true,
        });
        await subscriptionRepo.save(subscription);
    }

    return subscription;
}

/**
 * Get message count for current month by counting messages from the Message table
 */
export async function getCurrentMonthMessageCount(organizationId: number): Promise<number> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Count messages from user (sender = 'USER') in the current month for this organization
    const messageRepo = AppDataSource.getRepository(Message);

    const count = await messageRepo
        .createQueryBuilder('message')
        .innerJoin('message.agent', 'agent')
        .innerJoin('agent.workspace', 'workspace')
        .where('workspace.organizationId = :organizationId', { organizationId })
        .andWhere('message.sender = :sender', { sender: 'USER' })
        .andWhere('message.createdAt >= :startOfMonth', { startOfMonth })
        .getCount();

    return count;
}

/**
 * Check if organization can send a message
 */
export async function checkMessageQuota(organizationId: number): Promise<{
    allowed: boolean;
    remaining: number;
    limit: number;
    tier: SubscriptionTier;
}> {
    const subscription = await getOrCreateSubscription(organizationId);
    const messageCount = await getCurrentMonthMessageCount(organizationId);

    const limit = PLAN_LIMITS[subscription.tier];
    const remaining = Math.max(0, limit - messageCount);
    const allowed = remaining > 0;

    return {
        allowed,
        remaining,
        limit,
        tier: subscription.tier,
    };
}

/**
 * Track a message usage in Autumn (no need to track locally since we count from Message table)
 */
export async function trackMessageUsage(organizationId: number): Promise<void> {
    // Track in Autumn if we have a customer ID
    const subscription = await getOrCreateSubscription(organizationId);
    if (subscription.autumnCustomerId) {
        try {
            await autumnClient.track({
                customerId: subscription.autumnCustomerId,
                featureId: 'messages',
                value: 1,
            });
        } catch (error) {
            console.error('Failed to track usage in Autumn:', error);
            // Don't throw - message is already saved in DB
        }
    }
}

/**
 * Get checkout URL for upgrading to paid plan
 */
export async function getUpgradeCheckoutUrl(
    organizationId: number,
    successUrl: string,
    cancelUrl: string
): Promise<string> {
    const subscription = await getOrCreateSubscription(organizationId);

    // Generate or use existing Autumn customer ID
    const customerId = subscription.autumnCustomerId || `org_${organizationId}`;

    const response = await autumnClient.attach({
        customerId,
        productId: AUTUMN_PRODUCT_IDS[SubscriptionTier.PAID],
        successUrl,
        cancelUrl,
    });

    if (!response.checkoutUrl) {
        throw new Error('Failed to get checkout URL from Autumn');
    }

    // Update subscription with customer ID if it's new
    if (!subscription.autumnCustomerId) {
        const subscriptionRepo = AppDataSource.getRepository(Subscription);
        subscription.autumnCustomerId = customerId;
        await subscriptionRepo.save(subscription);
    }

    return response.checkoutUrl;
}

/**
 * Update subscription tier (typically called via webhook)
 */
export async function updateSubscriptionTier(
    organizationId: number,
    tier: SubscriptionTier,
    stripeCustomerId?: string,
    stripeSubscriptionId?: string
): Promise<void> {
    const subscriptionRepo = AppDataSource.getRepository(Subscription);
    const subscription = await getOrCreateSubscription(organizationId);

    subscription.tier = tier;
    subscription.isActive = true;

    if (stripeCustomerId) {
        subscription.stripeCustomerId = stripeCustomerId;
    }

    if (stripeSubscriptionId) {
        subscription.stripeSubscriptionId = stripeSubscriptionId;
    }

    // Set billing period dates
    const now = new Date();
    subscription.currentPeriodStart = now;
    subscription.currentPeriodEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());

    await subscriptionRepo.save(subscription);
}

/**
 * Get current usage and subscription info
 */
export async function getSubscriptionInfo(organizationId: number): Promise<{
    tier: SubscriptionTier;
    messageCount: number;
    messageLimit: number;
    remaining: number;
    isActive: boolean;
}> {
    const subscription = await getOrCreateSubscription(organizationId);
    const messageCount = await getCurrentMonthMessageCount(organizationId);
    const limit = PLAN_LIMITS[subscription.tier];

    return {
        tier: subscription.tier,
        messageCount,
        messageLimit: limit,
        remaining: Math.max(0, limit - messageCount),
        isActive: subscription.isActive,
    };
}
