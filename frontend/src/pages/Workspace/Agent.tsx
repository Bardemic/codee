import { Link } from "react-router-dom";
import type { provider_agent } from "../../app/services/workspaces/workspacesService";
import styles from './workspace.module.css';

export default function Agent({ integration, url }: provider_agent) {
    return(
        <Link to={url} target="_blank" rel="noopener noreferrer">
            <button className={styles.openAgent}>
                {integration}
            </button>
        </Link>
    )
}