# Payment System Setup Guide

This guide explains how to set up the Autumn payment integration for Codee.

## Overview

Codee now includes a payment system powered by [Autumn](https://useautumn.com), a Y Combinator-backed Stripe wrapper for AI startups. The system supports two tiers:

- **Free Tier**: Up to 10 messages per month
- **Paid Tier**: Up to 100 messages per month

## Architecture

### Backend Components

1. **Database Entities** (`backend/src/db/entities/`)
   - `Subscription.ts` - Stores organization subscription information
   - Usage is calculated from the existing `Message` table (no separate usage table needed)

2. **Services** (`backend/src/services/`)
   - `autumnClient.ts` - Autumn API client for `/attach`, `/check`, and `/track` endpoints
   - `billingService.ts` - Business logic for subscription management and usage tracking

3. **API Router** (`backend/src/trpc/routers/`)
   - `billing.ts` - tRPC endpoints for billing operations:
     - `getInfo` - Get current subscription and usage
     - `checkQuota` - Check if organization can send messages
     - `getCheckoutUrl` - Get Stripe checkout URL for upgrades
     - `updateTier` - Update subscription tier (webhook/admin use)

4. **Usage Enforcement** (`backend/src/trpc/routers/workspace.ts`)
   - Message quota checking before workspace creation and message sending
   - Automatic usage tracking after successful operations

### Frontend Components

1. **Billing UI** (`frontend/src/pages/Settings/`)
   - `Settings.tsx` - Displays current plan, usage, and upgrade options
   - `Settings.module.css` - Minimal styling (ready for design improvements)

## Environment Variables

Add the following environment variables to your backend configuration:

```bash
# Autumn API Configuration
AUTUMN_API_KEY=your_autumn_api_key_here
AUTUMN_API_URL=https://api.useautumn.com  # Optional, defaults to this

# Autumn Product IDs (from your Autumn dashboard)
AUTUMN_PAID_PRODUCT_ID=paid  # Replace with your actual product ID from Autumn
```

## Setup Steps

### 1. Set Up Autumn Account

1. Sign up at [app.useautumn.com](https://app.useautumn.com)
2. Create your pricing products in the Autumn dashboard:
   - Free tier (for reference, though users start here by default)
   - Paid tier with your desired pricing

3. Copy your API key from the Autumn dashboard
4. Copy the product ID for your paid tier

### 2. Configure Environment Variables

Add the environment variables to your deployment configuration:

```bash
AUTUMN_API_KEY=autumn_xxx
AUTUMN_PAID_PRODUCT_ID=prod_xxx
```

### 3. Run Database Migrations

The new `Subscription` entity will be automatically created by TypeORM's synchronize feature in development. For production, you should:

1. Generate migrations:
   ```bash
   cd backend
   npm run typeorm migration:generate -- -n AddSubscriptionTable
   ```

2. Run migrations:
   ```bash
   npm run typeorm migration:run
   ```

Note: Usage is calculated from the existing `Message` table, so no additional tables are needed.

### 4. Configure Stripe Webhooks (Optional)

If you want to handle subscription changes via webhooks, set up Stripe webhooks in your Autumn dashboard to call your backend endpoint:

```
POST /api/webhooks/stripe
```

Implement webhook handling in `backend/src/express/webhooks.ts` to:
- Update subscription status on payment success/failure
- Handle subscription cancellations
- Track subscription period changes

## Usage

### For Users

1. Navigate to Settings page
2. View current plan and message usage
3. Click "Upgrade" on the Paid plan card
4. Complete checkout via Stripe
5. Return to Settings to see updated plan

### For Developers

#### Check Usage Quota

```typescript
import { checkMessageQuota } from './services/billingService';

const quota = await checkMessageQuota(organizationId);
if (!quota.allowed) {
  throw new Error('Message limit reached');
}
```

#### Track Usage

```typescript
import { trackMessageUsage } from './services/billingService';

await trackMessageUsage(organizationId);
```

#### Get Subscription Info

```typescript
import { getSubscriptionInfo } from './services/billingService';

const info = await getSubscriptionInfo(organizationId);
console.log(`Plan: ${info.tier}, Used: ${info.messageCount}/${info.messageLimit}`);
```

## Plan Limits Configuration

To modify plan limits, edit `backend/src/services/billingService.ts`:

```typescript
export const PLAN_LIMITS = {
    [SubscriptionTier.FREE]: 10,   // Free tier limit
    [SubscriptionTier.PAID]: 100,  // Paid tier limit
};
```

## Frontend Customization

The billing UI is intentionally minimal and ready for design improvements. Key files to customize:

- `frontend/src/pages/Settings/Settings.tsx` - React component
- `frontend/src/pages/Settings/Settings.module.css` - Styling

Current features:
- Current plan display
- Usage progress bar
- Two plan cards (Free and Paid)
- Upgrade button with loading state

## Testing

### Local Development

1. Set `AUTUMN_API_KEY` to a test key from Autumn
2. Create test workspaces and send messages
3. Verify usage tracking in the database:
   ```sql
   SELECT * FROM usage WHERE "organizationId" = YOUR_ORG_ID;
   SELECT * FROM subscription WHERE "organizationId" = YOUR_ORG_ID;
   ```

### Test Scenarios

- [ ] New organization gets FREE tier by default
- [ ] Sending 10 messages (free limit) succeeds
- [ ] Sending 11th message fails with quota error
- [ ] Upgrade button redirects to Stripe checkout
- [ ] After upgrade, quota increases to 100
- [ ] Usage resets at the start of each month

## Troubleshooting

### "Message limit reached" Error

1. Check current usage by counting messages:
   ```sql
   SELECT COUNT(*) FROM message m
   JOIN agent a ON m."agentId" = a.id
   JOIN workspace w ON a."workspaceId" = w.id
   WHERE w."organizationId" = X
   AND m.sender = 'USER'
   AND m."createdAt" >= DATE_TRUNC('month', CURRENT_DATE);
   ```
2. Verify subscription tier: `SELECT * FROM subscription WHERE "organizationId" = X;`
3. Ensure usage calculation is working correctly

### Checkout URL Not Generated

1. Verify `AUTUMN_API_KEY` is set correctly
2. Check Autumn API logs for errors
3. Ensure `AUTUMN_PAID_PRODUCT_ID` matches your Autumn dashboard

### Usage Not Counting Correctly

1. Verify messages are being saved to the `Message` table with correct `sender` field
2. Check that workspaces are properly linked to organizations
3. Review the `getCurrentMonthMessageCount()` function in `billingService.ts`
4. Ensure the date filtering is working correctly for the current month

## Resources

- **Autumn Documentation**: https://docs.useautumn.com/
- **Autumn GitHub**: https://github.com/useautumn/autumn
- **Autumn Dashboard**: https://app.useautumn.com

## Future Enhancements

Consider implementing:

- [ ] Webhook handling for automatic subscription updates
- [ ] Email notifications for quota warnings (90% usage)
- [ ] Usage analytics dashboard
- [ ] Additional tiers (Pro, Enterprise)
- [ ] Team-based pricing
- [ ] Annual billing with discounts
- [ ] Usage history charts
- [ ] Invoice management
