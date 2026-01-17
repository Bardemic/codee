import styles from './Usage.module.css';

interface UsageCardProps {
    title: string;
    usedValue: string | number;
    limitValue: string | number;
    percentUsed: number;
}

export default function UsageCard({ title, usedValue, limitValue, percentUsed }: UsageCardProps) {
    return (
        <div className={styles.usageCard}>
            <div>
                <span className={styles.usageTitle}>{title}</span>
                <div className={styles.usageValues}>
                    {usedValue} <span className={styles.limit}>/ {limitValue}</span>
                </div>
            </div>
            <div className={styles.progressBarContainer}>
                <div
                    className={styles.progressBar}
                    style={{ '--progress-width': `${Math.min(percentUsed, 100)}%` } as React.CSSProperties}
                />
            </div>
            <div className={styles.usageFooter}>
                <span className={styles.percentUsed}>{percentUsed.toFixed(2)}% used</span>
            </div>
        </div>
    );
}
