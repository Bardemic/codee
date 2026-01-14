/**
 * Payment and subscription management tRPC router
 */

import { TRPCError } from '@trpc/server';
import { authedProcedure, router } from '../trpc';
import { AppDataSource } from '../../db/data-source';
import { Organization } from '../../db/entities/Organization';
import { getOrCreateStripeCustomer, createCheckoutSession, createPortalSession } from '../../payment/stripe';
import { getUsageStats } from '../../payment/usage';
import { PLANS } from '../../payment/plans';

export const paymentRouter = router({
    /**
     * Get current subscription status and usage
     */
    getSubscriptionStatus: authedProcedure.query(async ({ ctx }) => {
        const organizationRepo = AppDataSource.getRepository(Organization);
        const organization = await organizationRepo.findOne({
            where: { id: ctx.organization.id },
        });

        if (!organization) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
        }

        const usage = await getUsageStats(organization.id);

        return {
            tier: organization.subscriptionTier,
            status: organization.subscriptionStatus,
            stripeCustomerId: organization.stripeCustomerId,
            stripeSubscriptionId: organization.stripeSubscriptionId,
            cancelAtPeriodEnd: organization.cancelAtPeriodEnd,
            usage,
            plans: Object.values(PLANS).map((plan) => ({
                tier: plan.tier,
                name: plan.name,
                description: plan.description,
                tokenCostLimitMicrodollars: plan.tokenCostLimitMicrodollars,
                sandboxTimeLimitSeconds: plan.sandboxTimeLimitSeconds,
                priceMonthly: plan.priceMonthly,
            })),
        };
    }),
    createCheckoutSession: authedProcedure.mutation(async ({ ctx }) => {
        const organizationRepo = AppDataSource.getRepository(Organization);
        const organization = await organizationRepo.findOne({
            where: { id: ctx.organization.id },
        });

        if (!organization) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
        }

        try {
            const customerId = await getOrCreateStripeCustomer(organization, ctx.user.email);

            if (customerId !== organization.stripeCustomerId) {
                await organizationRepo.update(organization.id, {
                    stripeCustomerId: customerId,
                });
            }

            // Create checkout session
            const checkoutUrl = await createCheckoutSession(customerId, organization.id);

            return { url: checkoutUrl };
        } catch (error) {
            console.error('Error creating checkout session:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create checkout session',
            });
        }
    }),

    /**
     * Create a Stripe Billing Portal session for managing subscriptions
     */
    createPortalSession: authedProcedure.mutation(async ({ ctx }) => {
        const organizationRepo = AppDataSource.getRepository(Organization);
        const organization = await organizationRepo.findOne({
            where: { id: ctx.organization.id },
        });

        if (!organization) {
            throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' });
        }

        if (!organization.stripeCustomerId) {
            throw new TRPCError({
                code: 'BAD_REQUEST',
                message: 'No Stripe customer found for this organization',
            });
        }

        try {
            const portalUrl = await createPortalSession(organization.stripeCustomerId);
            return { url: portalUrl };
        } catch (error) {
            console.error('Error creating portal session:', error);
            throw new TRPCError({
                code: 'INTERNAL_SERVER_ERROR',
                message: 'Failed to create portal session',
            });
        }
    }),
});
