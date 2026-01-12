import { useState } from 'react';
import { trpc } from '../../lib/trpc';
import styles from './Settings.module.css';
import { FiEdit2, FiCheck, FiX } from 'react-icons/fi';

export default function Settings() {
    const utils = trpc.useUtils();
    const { data: organization } = trpc.organization.get.useQuery();
    const { data: members } = trpc.organization.listMembers.useQuery();
    const updateName = trpc.organization.updateName.useMutation({
        onSuccess: () => {
            utils.organization.get.invalidate();
            setIsEditing(false);
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
        </div>
    );
}
