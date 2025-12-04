import type { Worker } from "../../app/services/workers/workersService";
import styles from './workers.module.css';
import { formatDistanceToNow } from "date-fns";
import { Link } from "react-router-dom";
import { BsBoxArrowUpRight } from "react-icons/bs";

interface props {
    worker: Worker
    openView: (worker: Worker) => void
}

export default function WorkerCard({ worker, openView }: props) {
    return (
        <div className={styles.workerCard}>
            <div className={styles.slugCard}>{worker.slug}</div>
            <div className={styles.promptCard}>{worker.prompt}</div>
            <div className={styles.previousWorkspaces}>
                {worker.workspaces.length == 0 && <div className={styles.noWorkspaces}>No workspaces yet</div>}
                {worker.workspaces.map((workspace) => (
                    <Link 
                        to={`/agent/${workspace.agents[0].id}`} 
                        className={styles.prevWorkspace} 
                        key={workspace.id}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className={styles.workspaceNameContainer}>
                            <BsBoxArrowUpRight size={12} className={styles.workspaceIcon} />
                            <p className={styles.workspaceName}>{workspace.name}</p>
                        </div>
                        <p className={styles.workspaceTime}>{formatDistanceToNow(new Date(workspace.created_at)).replace('about ', '').replace(' hours', 'hr').replace(' hour', 'hr').replace(' minutes', 'm').replace(' minute', 'm').replace('less than a minute', '<1m')}</p>
                    </Link>
                ))}
            </div>
            <button className={styles.openWorker} onClick={() => openView(worker)}>
                Open
            </button>
        </div>
    )
}
