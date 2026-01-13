import Stripe from 'stripe';
import { Organization, SubscriptionTier, SubscriptionStatus } from '../db/entities/Organization';
import { PLANS } from './plans';

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

if (!stripeSecretKey) {
    console.warn('STRIPE_SECRET_KEY not set - payment features will be disabled');
}

export const stripe = stripeSecretKey
    ? new Stripe(stripeSecretKey, {
          apiVersion: '2025-12-15.clover',
      })
    : null;

export async function getOrCreateStripeCustomer(organization: Organization, email: string): Promise<string> {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }

    if (organization.stripeCustomerId) {
        return organization.stripeCustomerId;
    }

    const customer = await stripe.customers.create({
        email,
        metadata: {
            organizationId: organization.id.toString(),
            workosOrganizationId: organization.workosOrganizationId,
        },
    });

    return customer.id;
}

export async function createCheckoutSession(customerId: string, organizationId: number): Promise<string> {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }

    const paidPlan = PLANS[SubscriptionTier.PAID];

    if (!paidPlan.stripePriceId) {
        throw new Error('Stripe price ID for paid plan is not configured');
    }

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
            {
                price: paidPlan.stripePriceId,
                quantity: 1,
            },
        ],
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?payment=success`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings?payment=canceled`,
        metadata: {
            organizationId: organizationId.toString(),
        },
        subscription_data: {
            metadata: {
                organizationId: organizationId.toString(),
            },
        },
    });

    return session.url!;
}

export async function createPortalSession(customerId: string): Promise<string> {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }

    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings`,
    });

    return session.url;
}

export async function getSubscriptionStatus(subscriptionId: string): Promise<{
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
}> {
    if (!stripe) {
        throw new Error('Stripe is not configured');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    const firstItem = subscription.items.data[0];
    if (!firstItem) throw new Error('Subscription item missing');

    return {
        status: subscription.status,
        currentPeriodStart: new Date(firstItem.current_period_start * 1000),
        currentPeriodEnd: new Date(firstItem.current_period_end * 1000),
    };
}

export function mapStripeStatus(stripeStatus: string): SubscriptionStatus {
    switch (stripeStatus) {
        case 'active':
        case 'trialing':
            return SubscriptionStatus.ACTIVE;
        case 'canceled':
        case 'unpaid':
            return SubscriptionStatus.CANCELED;
        case 'past_due':
            return SubscriptionStatus.PAST_DUE;
        case 'incomplete':
        case 'incomplete_expired':
            return SubscriptionStatus.INCOMPLETE;
        default:
            return SubscriptionStatus.CANCELED;
    }
}
