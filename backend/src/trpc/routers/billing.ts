import { z } from 'zod';
import { authedProcedure, router } from '../trpc';
import {
    getSubscriptionInfo,
    checkMessageQuota,
    getUpgradeCheckoutUrl,
    updateSubscriptionTier,
} from '../../services/billingService';
import { SubscriptionTier } from '../../db/entities/Subscription';

export const billingRouter = router({
    /**
     * Get current subscription and usage info
     */
    getInfo: authedProcedure.query(async ({ ctx }) => {
        const info = await getSubscriptionInfo(ctx.organization.id);
        return info;
    }),

    /**
     * Check if organization can send a message
     */
    checkQuota: authedProcedure.query(async ({ ctx }) => {
        const quota = await checkMessageQuota(ctx.organization.id);
        return quota;
    }),

    /**
     * Get checkout URL for upgrading to paid plan
     */
    getCheckoutUrl: authedProcedure
        .input(
            z.object({
                successUrl: z.string().url(),
                cancelUrl: z.string().url(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const checkoutUrl = await getUpgradeCheckoutUrl(
                ctx.organization.id,
                input.successUrl,
                input.cancelUrl
            );
            return { checkoutUrl };
        }),

    /**
     * Update subscription tier (admin/webhook use)
     */
    updateTier: authedProcedure
        .input(
            z.object({
                tier: z.nativeEnum(SubscriptionTier),
                stripeCustomerId: z.string().optional(),
                stripeSubscriptionId: z.string().optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await updateSubscriptionTier(
                ctx.organization.id,
                input.tier,
                input.stripeCustomerId,
                input.stripeSubscriptionId
            );
            return { success: true };
        }),
});
