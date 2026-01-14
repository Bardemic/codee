import Stripe from 'stripe';
import { stripe, mapStripeStatus } from './stripe';
import { AppDataSource } from '../db/data-source';
import { Organization, SubscriptionTier } from '../db/entities/Organization';
import { getTokenCostLimitMicrodollars, getSandboxTimeLimitSeconds } from './plans';

export async function handleStripeWebhook(body: string | Buffer, signature: string): Promise<{ received: boolean }> {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
        console.warn('Webhook received but STRIPE_WEBHOOK_SECRET not configured');
        return { received: true };
    }

    let event: Stripe.Event;

    try {
        event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        throw new Error('Invalid webhook signature');
    }

    console.log('Stripe webhook received:', event.type);
    try {
        switch (event.type) {
            case 'checkout.session.completed':
                await handleCheckoutCompleted(event.data.object);
                break;

            case 'customer.subscription.created':
            case 'customer.subscription.updated':
                await handleSubscriptionUpdated(event.data.object);
                break;

            case 'customer.subscription.deleted':
                await handleSubscriptionDeleted(event.data.object);
                break;

            case 'invoice.payment_failed':
                await handlePaymentFailed(event.data.object);
                break;

            default:
                console.log(`Unhandled webhook event type: ${event.type}`);
        }
    } catch (error) {
        console.error(`Error handling webhook event ${event.type}:`, error);
        throw error;
    }

    return { received: true };
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const organizationId = session.metadata?.organizationId;
        if (!organizationId) {
            console.error('No organizationId in checkout session metadata');
            throw new Error('No organizationId in checkout session metadata');
        }

        const organizationRepo = queryRunner.manager.getRepository(Organization);
        const organization = await organizationRepo.findOne({
            where: { id: parseInt(organizationId) },
        });

        if (!organization) {
            console.error(`Organization ${organizationId} not found`);
            throw new Error(`Organization ${organizationId} not found`);
        }

        // Validate that customer and subscription IDs are present
        if (!session.customer || !session.subscription) {
            console.error('Checkout session missing customer or subscription ID');
            throw new Error('Checkout session missing customer or subscription ID');
        }

        // Extract IDs from customer and subscription (could be string or object)
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id;
        const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;

        // Update organization with customer and subscription IDs
        await organizationRepo.update(organization.id, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subscriptionId,
            cancelAtPeriodEnd: false,
        });

        await queryRunner.commitTransaction();
        console.log(`Checkout completed for organization ${organizationId}`);
    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Error in handleCheckoutCompleted:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const organizationId = subscription.metadata?.organizationId;

        // Find organization by subscription ID if no metadata
        const organizationRepo = queryRunner.manager.getRepository(Organization);
        let organization: Organization | null = null;

        if (organizationId) {
            organization = await organizationRepo.findOne({
                where: { id: parseInt(organizationId) },
            });
        } else {
            organization = await organizationRepo.findOne({
                where: { stripeSubscriptionId: subscription.id },
            });
        }

        if (!organization) {
            console.error('Organization not found for subscription:', subscription.id);
            throw new Error(`Organization not found for subscription: ${subscription.id}`);
        }

        const status = mapStripeStatus(subscription.status);
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const newTier = isActive ? SubscriptionTier.PAID : SubscriptionTier.FREE;

        // Check if subscription is scheduled to cancel at period end
        // When cancelled, Stripe sets cancel_at to the end timestamp (not cancel_at_period_end)
        const cancelAtPeriodEnd = subscription.cancel_at !== null;

        const firstItem = subscription.items.data[0];
        if (!firstItem) {
            console.error('Subscription item missing');
            throw new Error('Subscription item missing');
        }

        if (organization.stripeSubscriptionId && organization.stripeSubscriptionId !== subscription.id) {
            console.error(
                `Subscription ID mismatch for organization ${organization.id}: existing=${organization.stripeSubscriptionId}, new=${subscription.id}`
            );
            throw new Error('Subscription ID mismatch - potential security issue');
        }

        const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
        if (organization.stripeCustomerId && organization.stripeCustomerId !== customerId) {
            console.error(`Customer ID mismatch for organization ${organization.id}: existing=${organization.stripeCustomerId}, new=${customerId}`);
            throw new Error('Customer ID mismatch - potential security issue');
        }

        const newPeriodStart = new Date(firstItem.current_period_start * 1000);
        const newPeriodEnd = new Date(firstItem.current_period_end * 1000);

        // Reset usage counters when billing period advances
        const periodAdvanced = newPeriodStart.getTime() > organization.billingPeriodStart.getTime();

        await organizationRepo.update(organization.id, {
            stripeSubscriptionId: subscription.id,
            stripeCustomerId: customerId,
            subscriptionStatus: status,
            subscriptionTier: newTier,
            tokenCostLimitMicrodollars: isActive ? getTokenCostLimitMicrodollars(SubscriptionTier.PAID) : getTokenCostLimitMicrodollars(SubscriptionTier.FREE),
            sandboxTimeLimitSeconds: isActive ? getSandboxTimeLimitSeconds(SubscriptionTier.PAID) : getSandboxTimeLimitSeconds(SubscriptionTier.FREE),
            billingPeriodStart: newPeriodStart,
            billingPeriodEnd: newPeriodEnd,
            cancelAtPeriodEnd: cancelAtPeriodEnd,
            ...(periodAdvanced && { tokenCostUsedMicrodollars: 0, sandboxTimeUsedSeconds: 0 }),
        });

        await queryRunner.commitTransaction();
        const cancelDate = subscription.cancel_at ? new Date(subscription.cancel_at * 1000).toISOString() : 'none';
        console.log(
            `Subscription updated for organization ${organization.id}: ${organization.subscriptionTier} -> ${newTier}, status: ${subscription.status}, cancelAtPeriodEnd: ${cancelAtPeriodEnd}, cancelAt: ${cancelDate}`
        );
    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Error in handleSubscriptionUpdated:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const organizationRepo = queryRunner.manager.getRepository(Organization);
        const organization = await organizationRepo.findOne({
            where: { stripeSubscriptionId: subscription.id },
        });

        if (!organization) {
            console.error('Organization not found for subscription:', subscription.id);
            throw new Error(`Organization not found for subscription: ${subscription.id}`);
        }

        if (organization.stripeSubscriptionId !== subscription.id) {
            console.error(`Subscription ID mismatch during deletion for organization ${organization.id}`);
            throw new Error('Subscription ID mismatch during deletion');
        }

        // Reset billing period to start fresh on free tier
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await queryRunner.manager
            .createQueryBuilder()
            .update(Organization)
            .set({
                subscriptionTier: SubscriptionTier.FREE,
                subscriptionStatus: mapStripeStatus('canceled'),
                tokenCostLimitMicrodollars: getTokenCostLimitMicrodollars(SubscriptionTier.FREE),
                sandboxTimeLimitSeconds: getSandboxTimeLimitSeconds(SubscriptionTier.FREE),
                stripeSubscriptionId: null,
                cancelAtPeriodEnd: false,
                billingPeriodStart: now,
                billingPeriodEnd: periodEnd,
                tokenCostUsedMicrodollars: 0,
                sandboxTimeUsedSeconds: 0,
            })
            .where('id = :id', { id: organization.id })
            .execute();

        await queryRunner.commitTransaction();
        console.log(`Subscription deleted for organization ${organization.id}, downgraded to FREE tier`);
    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Error in handleSubscriptionDeleted:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}

async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const invoiceData = invoice as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
    };

    let subscriptionId: string | null = null;

    if (typeof invoiceData.subscription === 'string') {
        subscriptionId = invoiceData.subscription;
    } else if (invoiceData.subscription && typeof invoiceData.subscription === 'object') {
        subscriptionId = invoiceData.subscription.id;
    }

    if (!subscriptionId) {
        console.warn('Payment failed but no subscription ID found in invoice');
        return;
    }

    const queryRunner = AppDataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
        const organizationRepo = queryRunner.manager.getRepository(Organization);
        const organization = await organizationRepo.findOne({
            where: { stripeSubscriptionId: subscriptionId },
        });

        if (!organization) {
            console.error('Organization not found for subscription:', subscriptionId);
            throw new Error(`Organization not found for subscription: ${subscriptionId}`);
        }

        if (organization.stripeSubscriptionId !== subscriptionId) {
            console.error(`Subscription ID mismatch for organization ${organization.id} during payment failure`);
            throw new Error('Subscription ID mismatch during payment processing');
        }

        await organizationRepo.update(organization.id, {
            subscriptionStatus: mapStripeStatus('past_due'),
        });

        await queryRunner.commitTransaction();
        console.log(`Payment failed for organization ${organization.id}, status updated to PAST_DUE`);
    } catch (error) {
        await queryRunner.rollbackTransaction();
        console.error('Error in handlePaymentFailed:', error);
        throw error;
    } finally {
        await queryRunner.release();
    }
}
