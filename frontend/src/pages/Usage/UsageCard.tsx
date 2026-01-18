import styles from './Usage.module.css';

interface UsageCardProps {
    title: string;
    usedValue: string | number;
    limitValue: string | number;
    percentUsed: number;
}

export default function UsageCard({ title, usedValue, limitValue, percentUsed }: UsageCardProps) {
    // Determine color based on usage percentage
    const getStatusColor = (percent: number) => {
        if (percent >= 90) return 'rgba(239, 68, 68, 0.8)'; // Red
        if (percent >= 70) return 'rgba(251, 191, 36, 0.8)'; // Amber
        return 'var(--color-accent)'; // Default accent
    };

    return (
        <div className={styles.usageCard}>
            <div className={styles.usageHeader}>
                <span className={styles.usageTitle}>{title}</span>
            </div>
            <div className={styles.usageValues}>
                {usedValue} <span className={styles.limit}>/ {limitValue}</span>
            </div>
            <div className={styles.progressBarContainer}>
                <div
                    className={styles.progressBar}
                    style={{ 
                        '--progress-width': `${Math.min(percentUsed, 100)}%`,
                        background: `linear-gradient(90deg, ${getStatusColor(percentUsed)}, ${getStatusColor(percentUsed)}88)`
                    } as React.CSSProperties}
                />
            </div>
            <div className={styles.usageFooter}>
                <span className={styles.percentUsed}>{percentUsed}% used</span>
            </div>
        </div>
    );
}
