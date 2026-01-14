import { Link } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import styles from './Usage.module.css';
import UsageCard from './UsageCard';

const MICRODOLLARS_PER_DOLLAR = 1_000_000;

function microdollarsToDollars(microdollars: number): number {
    return microdollars / MICRODOLLARS_PER_DOLLAR;
}

function formatSeconds(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}

export default function Usage() {
    const { data: subscription } = trpc.payment.getSubscriptionStatus.useQuery();

    if (!subscription) return null;

    const { usage } = subscription;

    return (
        <div className={styles.page}>
            <h1>Usage</h1>

            <section className={styles.section}>
                <div className={styles.usageHeader}>
                    <h2>Current Billing Period</h2>
                    <p>Resets on {usage.billingPeriodEnd.toLocaleDateString()}</p>
                </div>
                <div className={styles.usageCards}>
                    <UsageCard
                        title="Token Cost"
                        usedValue={`$${microdollarsToDollars(usage.tokenCostUsedMicrodollars).toFixed(2)}`}
                        limitValue={`$${microdollarsToDollars(usage.tokenCostLimitMicrodollars).toFixed(2)}`}
                        percentUsed={usage.costPercentUsed}
                    />

                    <UsageCard
                        title="Sandbox Time"
                        usedValue={formatSeconds(usage.sandboxTimeUsedSeconds)}
                        limitValue={formatSeconds(usage.sandboxTimeLimitSeconds)}
                        percentUsed={usage.sandboxTimePercentUsed}
                    />
                </div>

                <h3>
                    Want higher limits?
                    <Link to="/organization"> Upgrade your plan</Link>
                </h3>
            </section>
        </div>
    );
}
