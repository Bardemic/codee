import { useNavigate } from "react-router-dom";
import type { Agent } from "../../app/services/workspaces/workspacesService";
import styles from './workspace.module.css';
import { FaExternalLinkAlt } from "react-icons/fa";

interface Props {
    agent: Agent;
    isActive: boolean;
}

export default function AgentCard({ agent, isActive }: Props) {
    const navigate = useNavigate();

    return(
        <div 
            className={`${styles.agentCard} ${isActive ? styles.agentCardActive : ''}`}
            onClick={() => navigate(`/agent/${agent.id}`)}
        >
            <div className={styles.agentHeader}>
                <span className={styles.agentName}>{agent.integration}</span>
                <div className={styles.statusIndicator}>
                    <span className={styles.statusText}>{agent.status}</span>
                    {agent.integration !== "Codee" && <FaExternalLinkAlt onClick={() => window.open(agent.url, '_blank')} size={12}/>}
                </div>
            </div>
        </div>
    )
}
