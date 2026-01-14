import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import styles from './Settings.module.css';
import { FiEdit2, FiCheck, FiX } from 'react-icons/fi';

const MICRODOLLARS_PER_DOLLAR = 1_000_000;

function microdollarsToDollars(microdollars: number): number {
    return microdollars / MICRODOLLARS_PER_DOLLAR;
}

export default function Settings() {
    const utils = trpc.useUtils();
    const { data: organization } = trpc.organization.get.useQuery();
    const { data: members } = trpc.organization.listMembers.useQuery();
    const { data: subscription } = trpc.payment.getSubscriptionStatus.useQuery();
    const updateName = trpc.organization.updateName.useMutation({
        onSuccess: () => {
            utils.organization.get.invalidate();
            setIsEditing(false);
        },
    });
    const createCheckout = trpc.payment.createCheckoutSession.useMutation({
        onSuccess: (data) => {
            window.location.href = data.url;
        },
    });
    const createPortal = trpc.payment.createPortalSession.useMutation({
        onSuccess: (data) => {
            window.location.href = data.url;
        },
    });

    const [isEditing, setIsEditing] = useState(false);
    const [editedName, setEditedName] = useState('');

    const handleEdit = () => {
        setEditedName(organization?.name || '');
        setIsEditing(true);
    };

    const handleSave = () => {
        if (editedName.trim()) {
            updateName.mutate({ name: editedName.trim() });
        }
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditedName('');
    };

    return (
        <div className={styles.settingsPage}>
            <h1>Organization Settings</h1>

            <section className={styles.section}>
                <h2>Organization Name</h2>
                <div className={styles.nameContainer}>
                    {isEditing ? (
                        <div className={styles.editContainer}>
                            <input type="text" value={editedName} onChange={(e) => setEditedName(e.target.value)} className={styles.nameInput} autoFocus />
                            <button onClick={handleSave} className={styles.iconButton}>
                                <FiCheck size={18} />
                            </button>
                            <button onClick={handleCancel} className={styles.iconButton}>
                                <FiX size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className={styles.nameDisplay}>
                            <span className={styles.orgName}>{organization?.name}</span>
                            <button onClick={handleEdit} className={styles.iconButton}>
                                <FiEdit2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </section>

            <section className={styles.section}>
                <h2>Members</h2>
                <div className={styles.membersList}>
                    {members?.map((member) => (
                        <div key={member.id} className={styles.memberCard}>
                            <div className={styles.memberInfo}>
                                <span className={styles.memberEmail}>{member.email}</span>
                                <span className={styles.memberRole}>{member.role}</span>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className={styles.section}>
                <h2>Billing & Usage</h2>
                {subscription && (
                    <>
                        <div className={styles.usageInfo}>
                            <p>
                                <strong>Current Plan:</strong> {subscription.tier}
                            </p>
                            {subscription.cancelAtPeriodEnd && (
                                <p className={styles.warningText}>
                                    Your subscription will be canceled at the end of the billing period on{' '}
                                    {new Date(subscription.usage.billingPeriodEnd).toLocaleDateString()}.
                                </p>
                            )}
                            <p>
                                <strong>Cost Used:</strong> ${microdollarsToDollars(subscription.usage.tokenCostUsedMicrodollars).toFixed(2)} / $
                                {microdollarsToDollars(subscription.usage.tokenCostLimitMicrodollars).toFixed(2)}
                            </p>
                            {subscription.usage.costPercentUsed >= 80 && !subscription.cancelAtPeriodEnd && (
                                <p className={styles.warningText}>You've used {subscription.usage.costPercentUsed}% of your token cost limit this billing period.</p>
                            )}
                        </div>

                        <div className={styles.plansContainer}>
                            {subscription.plans.map((plan) => (
                                <div key={plan.tier} className={`${styles.planCard} ${subscription.tier === plan.tier ? styles.currentPlan : ''}`}>
                                    <h3>{plan.name}</h3>
                                    <p className={styles.planDescription}>{plan.description}</p>
                                    <p className={styles.planPrice}>{plan.priceMonthly === 0 ? 'Free' : `$${plan.priceMonthly / 100}/month`}</p>
                                    <p className={styles.planMessages}>${microdollarsToDollars(plan.tokenCostLimitMicrodollars).toFixed(2)} token cost/month</p>

                                    {subscription.tier === plan.tier && !subscription.cancelAtPeriodEnd ? (
                                        <button className={styles.planButton} disabled>
                                            Current Plan
                                        </button>
                                    ) : plan.tier === 'FREE' ? (
                                        subscription.stripeSubscriptionId ? (
                                            <button className={styles.planButton} onClick={() => createPortal.mutate()} disabled={createPortal.isPending}>
                                                {createPortal.isPending ? 'Loading...' : 'Manage Subscription'}
                                            </button>
                                        ) : null
                                    ) : subscription.tier === plan.tier && subscription.cancelAtPeriodEnd ? (
                                        <button className={styles.planButton} onClick={() => createPortal.mutate()} disabled={createPortal.isPending}>
                                            {createPortal.isPending ? 'Loading...' : 'Reactivate'}
                                        </button>
                                    ) : (
                                        <button className={styles.planButton} onClick={() => createCheckout.mutate()} disabled={createCheckout.isPending}>
                                            {createCheckout.isPending ? 'Loading...' : 'Upgrade'}
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </section>
        </div>
    );
}
