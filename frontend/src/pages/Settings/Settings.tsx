import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import styles from './Settings.module.css';
import { FiEdit2, FiCheck, FiX } from 'react-icons/fi';

export default function Settings() {
    const utils = trpc.useUtils();
    const { data: organization } = trpc.organization.get.useQuery();
    const { data: members } = trpc.organization.listMembers.useQuery();
    const { data: billingInfo } = trpc.billing.getInfo.useQuery();
    const updateName = trpc.organization.updateName.useMutation({
        onSuccess: () => {
            utils.organization.get.invalidate();
            setIsEditing(false);
        },
    });
    const getCheckoutUrl = trpc.billing.getCheckoutUrl.useMutation();

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

    const handleUpgrade = async () => {
        try {
            const result = await getCheckoutUrl.mutateAsync({
                successUrl: `${window.location.origin}/settings?success=true`,
                cancelUrl: `${window.location.origin}/settings?canceled=true`,
            });
            if (result.checkoutUrl) {
                window.location.href = result.checkoutUrl;
            }
        } catch (error) {
            console.error('Failed to get checkout URL:', error);
            alert('Failed to start checkout process. Please try again.');
        }
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
                {billingInfo && (
                    <div className={styles.billingContainer}>
                        <div className={styles.usageInfo}>
                            <span className={styles.usageText}>
                                Current Plan: <strong>{billingInfo.tier}</strong>
                            </span>
                            <span className={styles.usageText}>
                                Messages Used: {billingInfo.messageCount} / {billingInfo.messageLimit} this month
                            </span>
                            <div className={styles.usageBar}>
                                <div
                                    className={styles.usageBarFill}
                                    style={{ width: `${(billingInfo.messageCount / billingInfo.messageLimit) * 100}%` }}
                                />
                            </div>
                        </div>

                        <div className={styles.plansGrid}>
                            <div className={`${styles.planCard} ${billingInfo.tier === 'FREE' ? styles.currentPlan : ''}`}>
                                <h3>Free</h3>
                                <div className={styles.planPrice}>$0/month</div>
                                <ul className={styles.planFeatures}>
                                    <li>Up to 10 messages per month</li>
                                    <li>Basic features</li>
                                </ul>
                                {billingInfo.tier === 'FREE' && <div className={styles.currentBadge}>Current Plan</div>}
                            </div>

                            <div className={`${styles.planCard} ${billingInfo.tier === 'PAID' ? styles.currentPlan : ''}`}>
                                <h3>Paid</h3>
                                <div className={styles.planPrice}>$20/month</div>
                                <ul className={styles.planFeatures}>
                                    <li>Up to 100 messages per month</li>
                                    <li>Priority support</li>
                                    <li>Advanced features</li>
                                </ul>
                                {billingInfo.tier === 'PAID' ? (
                                    <div className={styles.currentBadge}>Current Plan</div>
                                ) : (
                                    <button onClick={handleUpgrade} className={styles.upgradeButton} disabled={getCheckoutUrl.isPending}>
                                        {getCheckoutUrl.isPending ? 'Loading...' : 'Upgrade'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </section>
        </div>
    );
}
