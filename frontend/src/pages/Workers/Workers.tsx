import { trpc } from '../../lib/trpc';
import { CreateWorkerModal } from './components/CreateWorkerModal/CreateWorkerModal';
import { useState } from 'react';
import styles from './workers.module.css';
import type { Worker } from '../../lib/types';
import WorkerCard from './WorkerCard';

export default function Workers() {
    const { data: workers } = trpc.workers.list.useQuery();
    const { data: integrations } = trpc.integrations.list.useQuery();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);

    return (
        <div className={styles.page}>
            <h1>
                <p>Workers configuration</p>
                <button className={styles.newWorkerButton} onClick={() => setIsCreateModalOpen(true)}>
                    New Worker
                </button>
            </h1>

            <div className={styles.workerCards}>
                {workers?.length === 0 && <div className={styles.noWorkers}>No workers found. Create one to get started!</div>}
                {workers?.map((worker) => (
                    <WorkerCard worker={worker} key={worker.id} openView={setSelectedWorker} />
                ))}
            </div>

            <CreateWorkerModal isOpen={isCreateModalOpen} onClose={() => setIsCreateModalOpen(false)} integrations={integrations ?? []} />

            <CreateWorkerModal isOpen={!!selectedWorker} onClose={() => setSelectedWorker(null)} integrations={integrations ?? []} worker={selectedWorker} />
        </div>
    );
}
