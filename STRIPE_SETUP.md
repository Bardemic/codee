# Stripe Payment Integration Setup

This guide explains how to set up and configure Stripe payments for Codee.

## Overview

Codee now includes a subscription-based payment system with two tiers:

- **Free**: $5.00 token cost limit per month
- **Paid**: $20.00 token cost limit per month at $20/month

## Architecture

### Backend Structure

```
backend/src/payment/
├── plans.ts          # Plan definitions and pricing
├── stripe.ts         # Stripe client and core functions
├── usage.ts          # Cost usage tracking
├── webhook.ts        # Webhook event handlers
└── router.ts         # tRPC payment endpoints (in trpc/routers/)
```

### Database Changes

The `Organization` entity has been extended with subscription fields:
- `stripeCustomerId` - Stripe customer ID
- `stripeSubscriptionId` - Active subscription ID
- `subscriptionTier` - FREE or PAID
- `subscriptionStatus` - ACTIVE, CANCELED, PAST_DUE, INCOMPLETE
- `tokenCostUsedMicrodollars` - Current period cost usage
- `tokenCostLimitMicrodollars` - Maximum cost for tier
- `billingPeriodStart` - Current billing period start
- `billingPeriodEnd` - Current billing period end

### Cost Limit Enforcement

Cost limits are enforced at two points:
1. **Workspace creation** (`workspace.create`) - Checks cost limits before creating new workspace
2. **Message sending** (`workspace.sendMessage`) - Checks cost limits before sending messages

## Stripe Dashboard Setup

### 1. Create a Stripe Account

1. Go to [stripe.com](https://stripe.com) and sign up
2. Complete your account setup and verification

### 2. Create a Product and Price

1. Go to **Products** in the Stripe Dashboard
2. Click **Add Product**
3. Configure:
   - Name: "Codee Paid Plan" (or your preferred name)
   - Description: "Paid plan"
   - Pricing:
     - Type: Recurring
     - Price: $20.00
     - Billing period: Monthly
4. Save and copy the **Price ID** (starts with `price_`)

### 3. Get API Keys

1. Go to **Developers** → **API Keys**
2. Copy your **Secret key** (starts with `sk_test_` for test mode)
3. For production, use the live mode secret key

### 4. Set Up Webhooks

1. Go to **Developers** → **Webhooks**
2. Click **Add endpoint**
3. Configure:
   - Endpoint URL: `https://your-domain.com/webhooks/stripe`
   - Events to send:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
4. Save and copy the **Signing secret** (starts with `whsec_`)

## Environment Variables

Add these to your `.env` file:

```bash
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_PAID=price_...

# Optional: Frontend URL for redirects (defaults to http://localhost:3000)
FRONTEND_URL=http://localhost:5173
```

## Testing

### Test Mode

Use Stripe's test mode for development:

1. Use test API keys (starting with `sk_test_`)
2. Test cards:
   - Success: `4242 4242 4242 4242`
   - Decline: `4000 0000 0000 0002`
   - Requires authentication: `4000 0025 0000 3155`
3. Any future expiry date and any CVC will work

### Testing Webhooks Locally

Use the Stripe CLI to forward webhooks to localhost:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login to Stripe
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:5001/webhooks/stripe

# This will give you a webhook signing secret for testing
# Use it in your .env: STRIPE_WEBHOOK_SECRET=whsec_...
```

## API Endpoints

### tRPC Endpoints

**`payment.getSubscriptionStatus`**
- Returns current subscription status, usage, and available plans
- Used by frontend to display billing info

**`payment.createCheckoutSession`**
- Creates a Stripe Checkout session for upgrading to paid
- Returns URL to redirect user to Stripe Checkout

**`payment.createPortalSession`**
- Creates a Stripe Billing Portal session
- Allows users to manage their subscription, update payment methods, etc.
- Returns URL to redirect user to Stripe Portal

### Webhook Endpoint

**`POST /webhooks/stripe`**
- Handles Stripe webhook events
- Automatically updates subscription status and billing periods

## Frontend Integration

The Settings page (`/frontend/src/pages/Settings/Settings.tsx`) displays:

1. **Current Plan** - Shows user's tier (Free/Paid)
2. **Usage Stats** - Cost used vs. limit
3. **Plan Cards** - Two cards showing Free and Paid tiers with features
4. **Upgrade Button** - For free users to upgrade
5. **Manage Subscription** - For paid users to access billing portal

## Usage Flow

### Upgrading to Paid

1. User clicks "Upgrade" button on Paid plan card
2. Frontend calls `payment.createCheckoutSession`
3. User is redirected to Stripe Checkout
4. User enters payment information
5. On success:
   - Stripe fires `checkout.session.completed` webhook
   - Backend updates organization with customer and subscription IDs
   - Stripe fires `customer.subscription.created` webhook
   - Backend updates subscription tier to PAID
6. User is redirected back to Settings page

### Cost Limit Checks

1. User tries to create workspace or send message
2. Backend checks: `canSendMessage(organizationId)` (checks cost)
3. If limit reached, returns FORBIDDEN error
4. If allowed, operation proceeds

### Subscription Management

1. User clicks "Manage Subscription" button
2. Frontend calls `payment.createPortalSession`
3. User is redirected to Stripe Billing Portal
4. User can:
   - Update payment method
   - Cancel subscription
   - View invoices
5. On cancellation:
   - Stripe fires `customer.subscription.deleted` webhook
   - Backend downgrades to Free tier

## Production Deployment

### Switch to Live Mode

1. In Stripe Dashboard, toggle to **Live mode**
2. Get live API keys and webhook secret
3. Update environment variables with live keys
4. Update webhook endpoint URL to production domain
5. Test thoroughly before going live

### Security Considerations

- Never expose secret keys in frontend code
- Always verify webhook signatures
- Use HTTPS in production
- Implement rate limiting on API endpoints
- Monitor for suspicious activity

## Customization

### Changing Plan Limits

Edit `/backend/src/payment/plans.ts`:

```typescript
export const PLANS: Record<SubscriptionTier, PlanConfig> = {
    [SubscriptionTier.FREE]: {
        tokenCostLimitMicrodollars: 5_000_000, // $5.00
        priceMonthly: 0,
    },
    [SubscriptionTier.PAID]: {
        tokenCostLimitMicrodollars: 20_000_000, // $20.00
        priceMonthly: 2000, // Price in cents
    },
};
```

### Adding More Tiers

1. Add new tier to `SubscriptionTier` enum in `Organization.ts`
2. Add plan configuration to `PLANS` in `plans.ts`
3. Create new Stripe product and price
4. Update frontend to display new tier
5. Update webhook handlers to support new tier

## Troubleshooting

### Webhooks not working

- Check webhook signing secret is correct
- Verify endpoint URL is accessible from internet
- Check logs for webhook verification errors
- Use Stripe Dashboard webhook logs to debug

### Limits not updating

- Check database for correct subscription status
- Verify billing periods are set correctly
- Review webhook event logs

### Checkout not completing

- Verify price ID is correct
- Check success/cancel URLs are valid
- Review Stripe Dashboard for failed payments
- Check browser console for errors

## Support

For issues with:
- **Stripe integration**: Check [Stripe Documentation](https://docs.stripe.com)
- **Codee payments**: Open an issue on GitHub