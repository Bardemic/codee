import { useGetWorkersQuery } from "../../app/services/workers/workersService";
import { useGetIntegrationsQuery } from "../../app/services/integrations/integrationsService";
import { CreateWorkerModal } from "./components/CreateWorkerModal/CreateWorkerModal";
import { useState } from "react";
import styles from './workers.module.css';
import type { Worker } from "../../app/services/workers/workersService";
import WorkerCard from "./WorkerCard";

export default function Workers() {
    const { data: workers } = useGetWorkersQuery();
    const { data: integrations } = useGetIntegrationsQuery();
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
                {workers?.map(worker => (
                    <WorkerCard worker={worker} key={worker.id} openView={setSelectedWorker}/>
                ))}
            </div>

            <CreateWorkerModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                integrations={integrations ?? []}
            />

            <CreateWorkerModal
                isOpen={!!selectedWorker}
                onClose={() => setSelectedWorker(null)}
                integrations={integrations ?? []}
                worker={selectedWorker}
            />
        </div>
    );
}
