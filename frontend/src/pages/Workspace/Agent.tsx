import { Link } from "react-router-dom";
import type { provider_agent } from "../../app/services/workspaces/workspacesService";
import styles from './workspace.module.css';

export default function Agent({ integration, url }: provider_agent) {
    const status = "Active"; //temp

    return(
        <Link to={url} target="_blank" rel="noopener noreferrer" className={styles.agentCard}>
            <div className={styles.agentHeader}>
                <span className={styles.agentName}>{integration}</span>
                <div className={styles.statusIndicator}>
                    <span className={styles.statusText}>{status}</span>
                </div>
            </div>
        </Link>
    )
}
