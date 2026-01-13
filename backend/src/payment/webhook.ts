/**
 * Stripe webhook handler for subscription events
 */

import Stripe from 'stripe';
import { stripe, mapStripeStatus } from './stripe';
import { AppDataSource } from '../db/data-source';
import { Organization, SubscriptionTier } from '../db/entities/Organization';
import { getMessageLimit } from './plans';

/**
 * Handle incoming Stripe webhooks
 */
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
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        throw new Error('Invalid webhook signature');
    }

    console.log('Stripe webhook received:', event.type);

    // Handle different event types
    switch (event.type) {
        case 'checkout.session.completed':
            await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
            break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
            await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
            break;

        case 'customer.subscription.deleted':
            await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
            break;

        case 'invoice.payment_succeeded':
            await handlePaymentSucceeded(event.data.object as Stripe.Invoice);
            break;

        case 'invoice.payment_failed':
            await handlePaymentFailed(event.data.object as Stripe.Invoice);
            break;

        default:
            console.log(`Unhandled webhook event type: ${event.type}`);
    }

    return { received: true };
}

/**
 * Handle successful checkout session
 */
async function handleCheckoutCompleted(session: Stripe.Checkout.Session): Promise<void> {
    const organizationId = session.metadata?.organizationId;
    if (!organizationId) {
        console.error('No organizationId in checkout session metadata');
        return;
    }

    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { id: parseInt(organizationId) },
    });

    if (!organization) {
        console.error(`Organization ${organizationId} not found`);
        return;
    }

    // Update organization with customer and subscription IDs
    await organizationRepo.update(organization.id, {
        stripeCustomerId: session.customer as string,
        stripeSubscriptionId: session.subscription as string,
    });

    console.log(`Checkout completed for organization ${organizationId}`);
}

/**
 * Handle subscription creation or update
 */
async function handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    const organizationId = subscription.metadata?.organizationId;

    // Find organization by subscription ID if no metadata
    const organizationRepo = AppDataSource.getRepository(Organization);
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
        return;
    }

    const status = mapStripeStatus(subscription.status);
    const isActive = subscription.status === 'active' || subscription.status === 'trialing';
    const subAny = subscription as any;

    await organizationRepo.update(organization.id, {
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        subscriptionStatus: status,
        subscriptionTier: isActive ? SubscriptionTier.PAID : SubscriptionTier.FREE,
        messageLimit: isActive ? getMessageLimit(SubscriptionTier.PAID) : getMessageLimit(SubscriptionTier.FREE),
        billingPeriodStart: new Date((subAny.current_period_start || subAny.currentPeriodStart) * 1000),
        billingPeriodEnd: new Date((subAny.current_period_end || subAny.currentPeriodEnd) * 1000),
    });

    console.log(`Subscription updated for organization ${organization.id}:`, subscription.status);
}

/**
 * Handle subscription deletion/cancellation
 */
async function handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { stripeSubscriptionId: subscription.id },
    });

    if (!organization) {
        console.error('Organization not found for subscription:', subscription.id);
        return;
    }

    // Downgrade to free tier
    await organizationRepo
        .createQueryBuilder()
        .update(Organization)
        .set({
            subscriptionTier: SubscriptionTier.FREE,
            subscriptionStatus: mapStripeStatus('canceled'),
            messageLimit: getMessageLimit(SubscriptionTier.FREE),
            stripeSubscriptionId: null as any,
        })
        .where('id = :id', { id: organization.id })
        .execute();

    console.log(`Subscription deleted for organization ${organization.id}`);
}

/**
 * Handle successful payment (renewal)
 */
async function handlePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription === 'string' ? invoiceAny.subscription : invoiceAny.subscription?.id;
    if (!subscriptionId) return;

    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { stripeSubscriptionId: subscriptionId },
    });

    if (!organization) {
        console.error('Organization not found for subscription:', subscriptionId);
        return;
    }

    // Reset message count on successful payment (new billing period)
    await organizationRepo.update(organization.id, {
        messageCount: 0,
    });

    console.log(`Payment succeeded for organization ${organization.id}, message count reset`);
}

/**
 * Handle failed payment
 */
async function handlePaymentFailed(invoice: Stripe.Invoice): Promise<void> {
    const invoiceAny = invoice as any;
    const subscriptionId = typeof invoiceAny.subscription === 'string' ? invoiceAny.subscription : invoiceAny.subscription?.id;
    if (!subscriptionId) return;

    const organizationRepo = AppDataSource.getRepository(Organization);
    const organization = await organizationRepo.findOne({
        where: { stripeSubscriptionId: subscriptionId },
    });

    if (!organization) {
        console.error('Organization not found for subscription:', subscriptionId);
        return;
    }

    // Update status to past_due
    await organizationRepo.update(organization.id, {
        subscriptionStatus: mapStripeStatus('past_due'),
    });

    console.log(`Payment failed for organization ${organization.id}`);
}
