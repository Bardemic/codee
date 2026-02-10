import { trpc } from '../../lib/trpc';
import { CreateEnvironmentModal } from './components/CreateEnvironmentModal';
import { useState } from 'react';
import { GoRepo } from 'react-icons/go';
import styles from './environments.module.css';

export default function Environments() {
    const { data: environments } = trpc.environments.list.useQuery();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<number | null>(null);

    return (
        <div className={styles.page}>
            <h1>
                <p>Environments</p>
                <button className={styles.newEnvironmentButton} onClick={() => setIsCreateModalOpen(true)}>
                    New Environment
                </button>
            </h1>

            <div className={styles.environmentCards}>
                {environments?.length === 0 && (
                    <div className={styles.noEnvironments}>No environments found. Create one to get started!</div>
                )}
                {environments?.map((env) => (
                    <div
                        key={env.id}
                        className={styles.environmentCard}
                        onClick={() => setSelectedEnvironmentId(env.id)}
                    >
                        <div className={styles.nameCard}>{env.name}</div>
                        <div className={styles.repoCard}>
                            <GoRepo size={12} />
                            {env.github_repository_name}
                        </div>
                        {env.description && <div className={styles.descriptionCard}>{env.description}</div>}
                        <div className={styles.filesInfo}>
                            {env.file_paths.map((path) => (
                                <span key={path} className={styles.fileBadge}>
                                    {path}
                                </span>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <CreateEnvironmentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
            />

            <CreateEnvironmentModal
                isOpen={!!selectedEnvironmentId}
                onClose={() => setSelectedEnvironmentId(null)}
                environmentId={selectedEnvironmentId}
            />
        </div>
    );
}
