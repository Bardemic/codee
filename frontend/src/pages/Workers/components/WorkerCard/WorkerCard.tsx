import type { Worker } from "../../../../app/services/workers/workersService";
import styles from "../../workers.module.css";

interface WorkerCardProps {
    worker: Worker;
}

export function WorkerCard({ worker }: WorkerCardProps) {
    return (
        <div className={styles.workerCard}>
            <div className={styles.workerPrompt}>{worker.prompt}</div>
            <div className={styles.workerTools}>
                {worker.tools.length > 0 ? (
                    <div className={styles.toolsList}>
                        {worker.tools.map(tool => (
                            <span key={tool.id} className={styles.toolTag}>
                                {tool.display_name}
                            </span>
                        ))}
                    </div>
                ) : (
                    <span className={styles.noTools}>No tools selected</span>
                )}
            </div>
        </div>
    );
}
