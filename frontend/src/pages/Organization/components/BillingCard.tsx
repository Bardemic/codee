import { FiCheck, FiX } from 'react-icons/fi';
import styles from '../Organization.module.css';

interface PlanPerk {
    name: string;
    included: boolean;
}

interface BillingCardProps {
    plan: {
        tier: string;
        name: string;
        description: string;
        priceMonthly: number;
        tokenCostLimitMicrodollars: number;
        sandboxTimeLimitSeconds: number;
        perks: PlanPerk[];
    };
    isCurrentPlan: boolean;
    isCancelling: boolean;
    hasStripeSubscription: boolean;
    currentTier: string;
    onUpgrade: () => void;
    onManage: () => void;
    isLoading: boolean;
}

export default function BillingCard({
    plan,
    isCurrentPlan,
    isCancelling,
    hasStripeSubscription,
    currentTier,
    onUpgrade,
    onManage,
    isLoading,
}: BillingCardProps) {
    const isEnterprise = plan.tier === 'ENTERPRISE';
    const isEnterpriseCustomer = currentTier === 'ENTERPRISE';

    const handleContactUs = () => {
        window.location.href = 'mailto:sales@codee.com?subject=Enterprise Plan Inquiry';
    };

    const getButtonState = () => {
        // Handle current plan states first
        if (isCurrentPlan && isCancelling) {
            return {
                label: isLoading ? 'Loading...' : 'Reactivate',
                disabled: isLoading,
                onClick: onManage,
                isEnterprise: false,
            };
        }

        if (isCurrentPlan && plan.tier !== 'FREE') {
            return {
                label: isLoading ? 'Loading...' : 'Manage Subscription',
                disabled: isLoading,
                onClick: onManage,
                isEnterprise: false,
            };
        }

        if (isCurrentPlan && plan.tier === 'FREE') {
            return {
                label: 'Current Plan',
                disabled: true,
                onClick: () => {},
                isEnterprise: false,
            };
        }

        if (isEnterpriseCustomer && !isCurrentPlan) {
            return null;
        }

        if (isEnterprise) {
            return {
                label: 'Schedule a call',
                disabled: false,
                onClick: handleContactUs,
                isEnterprise: true,
            };
        }

        if (plan.tier === 'FREE' && hasStripeSubscription) {
            return null;
        }

        if (plan.tier === 'FREE') {
            return null;
        }

        return {
            label: isLoading ? 'Loading...' : 'Upgrade',
            disabled: isLoading,
            onClick: onUpgrade,
            isEnterprise: false,
        };
    };

    const buttonState = getButtonState();

    const renderPrice = () => {
        if (plan.priceMonthly === -1) {
            return (
                <p className={styles.planPrice}>
                    Custom<span className={styles.planPricePerMonth}> pricing</span>
                </p>
            );
        }
        return (
            <p className={styles.planPrice}>
                {plan.priceMonthly === 0 ? '$0' : `$${plan.priceMonthly / 100}`}
                <span className={styles.planPricePerMonth}>/month</span>
            </p>
        );
    };

    return (
        <div className={`${styles.planCard} ${isCurrentPlan ? styles.currentPlan : ''} ${isEnterprise && isCurrentPlan ? styles.enterpriseCard : ''}`}>
            {isCurrentPlan && <span className={styles.activeBadge}>Current Subscription</span>}
            <div className={styles.planHeader}>
                <h3>{plan.name}</h3>
                <div className={styles.planDetails}>{renderPrice()}</div>
            </div>
            <div className={styles.perksList}>
                {plan.perks.map((perk, index) => (
                    <div key={index} className={`${styles.perkItem} ${perk.included ? styles.perkIncluded : styles.perkExcluded}`}>
                        {perk.included ? <FiCheck className={styles.perkIcon} /> : <FiX className={styles.perkIcon} />}
                        <span className={styles.perkName}>{perk.name}</span>
                    </div>
                ))}
            </div>
            {buttonState && (
                <button
                    className={`${styles.planButton} ${buttonState.isEnterprise ? styles.enterpriseButton : ''}`}
                    onClick={buttonState.onClick}
                    disabled={buttonState.disabled}
                >
                    {buttonState.label}
                </button>
            )}
        </div>
    );
}
