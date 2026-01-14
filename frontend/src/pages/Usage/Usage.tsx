import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { keepPreviousData } from '@tanstack/react-query';
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

function formatMilliseconds(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    return formatSeconds(seconds);
}

export default function Usage() {
    const [page, setPage] = useState(1);
    const { data: subscription } = trpc.payment.getSubscriptionStatus.useQuery();
    const { data: messagesData } = trpc.payment.getRecentMessages.useQuery({ page, pageSize: 10 }, { placeholderData: keepPreviousData });

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

                {messagesData && messagesData.messages.length > 0 && (
                    <div className={styles.messagesSection}>
                        <h2>Recent Messages</h2>
                        <table className={styles.messagesTable}>
                            <thead>
                                <tr>
                                    <th>Date</th>
                                    <th>Model</th>
                                    <th>Runtime</th>
                                    <th>LLM Cost</th>
                                </tr>
                            </thead>
                            <tbody>
                                {messagesData.messages.map((message) => (
                                    <tr key={message.id}>
                                        <td>{new Date(message.createdAt).toLocaleString()}</td>
                                        <td>{message.model}</td>
                                        <td>{formatMilliseconds(message.sandboxDurationMs)}</td>
                                        <td>${microdollarsToDollars(message.costMicrodollars).toFixed(4)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {messagesData.totalPages > 1 && (
                            <div className={styles.pagination}>
                                <button type="button" onClick={() => setPage((p) => p - 1)} disabled={page === 1}>
                                    <FiChevronLeft />
                                </button>
                                <span>{page}</span>
                                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={page === messagesData.totalPages}>
                                    <FiChevronRight />
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
}
