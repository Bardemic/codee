import { useGetWorkersQuery } from "../../app/services/workers/workersService";
import { useGetIntegrationsQuery } from "../../app/services/integrations/integrationsService";
import { CreateWorkerModal } from "./components/CreateWorkerModal/CreateWorkerModal";
import { WorkerCard } from "./components/WorkerCard/WorkerCard";
import { useState } from "react";
import styles from "./workers.module.css";
import { BsPlus } from "react-icons/bs";

export default function Workers() {
    const { data: workers } = useGetWorkersQuery();
    const { data: integrations } = useGetIntegrationsQuery();
    const [isModalOpen, setIsModalOpen] = useState(false);

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <h1>Workers</h1>
                <button onClick={() => setIsModalOpen(true)}>
                    <BsPlus size={20} />
                    New Worker
                </button>
            </div>
            
            {workers && workers.length > 0 ? (
                <div className={styles.workersGrid}>
                    {workers.map(worker => (
                        <WorkerCard key={worker.id} worker={worker} />
                    ))}
                </div>
            ) : (
                <div>none</div>
            )}

            <CreateWorkerModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                integrations={integrations ?? []} 
            />
        </div>
    );
}
