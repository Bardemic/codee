import { useState } from 'react';
import { FiEdit2, FiCheck, FiX } from 'react-icons/fi';
import { trpc } from '../../lib/trpc';
import BillingCard from './components/BillingCard';
import styles from './Organization.module.css';

export default function Organization() {
    const utils = trpc.useUtils();
    const [isEditingName, setIsEditingName] = useState(false);
    const [editedName, setEditedName] = useState('');

    // Queries
    const { data: organization } = trpc.organization.get.useQuery();
    const { data: members } = trpc.organization.listMembers.useQuery();
    const { data: subscription } = trpc.payment.getSubscriptionStatus.useQuery();

    // Mutations
    const updateName = trpc.organization.updateName.useMutation({
        onSuccess: () => {
            utils.organization.get.invalidate();
            setIsEditingName(false);
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

    // Handlers
    const handleStartEdit = () => {
        setEditedName(organization?.name || '');
        setIsEditingName(true);
    };

    const handleSaveEdit = () => {
        const trimmedName = editedName.trim();
        if (trimmedName && trimmedName !== organization?.name) {
            updateName.mutate({ name: trimmedName });
        } else {
            setIsEditingName(false);
        }
    };

    const handleCancelEdit = () => {
        setIsEditingName(false);
        setEditedName('');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    return (
        <div className={styles.page}>
            <h1>Organization Settings</h1>

            {/* Organization Name Section */}
            <section className={styles.section}>
                <h2>Organization Name</h2>
                <div className={styles.nameContainer}>
                    {isEditingName ? (
                        <div className={styles.editContainer}>
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                onKeyDown={handleKeyDown}
                                className={styles.nameInput}
                                autoFocus
                                placeholder="Enter organization name"
                            />
                            <button onClick={handleSaveEdit} className={styles.iconButton} aria-label="Save" disabled={updateName.isPending}>
                                <FiCheck size={18} />
                            </button>
                            <button onClick={handleCancelEdit} className={styles.iconButton} aria-label="Cancel">
                                <FiX size={18} />
                            </button>
                        </div>
                    ) : (
                        <div className={styles.nameDisplay}>
                            <span className={styles.orgName}>{organization?.name || 'Loading...'}</span>
                            <button onClick={handleStartEdit} className={styles.iconButton} aria-label="Edit organization name">
                                <FiEdit2 size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </section>

            {/* Members Section */}
            <section className={styles.section}>
                <h2>Team Members</h2>
                {members && members.length > 0 ? (
                    <div className={styles.membersList}>
                        {members.map((member) => (
                            <div key={member.id} className={styles.memberCard}>
                                <div className={styles.memberInfo}>
                                    <span className={styles.memberEmail}>{member.email}</span>
                                    <span className={styles.memberRole}>{member.role}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className={styles.emptyState}>No members found</p>
                )}
            </section>

            {/* Billing Section */}
            <section className={styles.section}>
                <h2>Billing & Plans</h2>
                {subscription ? (
                    <div className={styles.plansContainer}>
                        {subscription.plans.map((plan) => (
                            <BillingCard
                                key={plan.tier}
                                plan={plan}
                                isCurrentPlan={subscription.tier === plan.tier}
                                isCancelling={subscription.cancelAtPeriodEnd}
                                hasStripeSubscription={!!subscription.stripeSubscriptionId}
                                currentTier={subscription.tier}
                                onUpgrade={() => createCheckout.mutate()}
                                onManage={() => createPortal.mutate()}
                                isLoading={createCheckout.isPending || createPortal.isPending}
                            />
                        ))}
                    </div>
                ) : (
                    <p className={styles.emptyState}>Loading subscription details...</p>
                )}
            </section>
        </div>
    );
}
