import { BsPencil } from "react-icons/bs";
import styles from "./styles.module.css";
import { CloudAgentsDropdown, type CloudAgentsSelection } from "../../../Home/components/CloudAgentsDropdown";
import type { Integration } from "../../../../app/services/integrations/integrationsService";

interface WorkerSlugHeaderProps {
    slug: string;
    setSlug: (slug: string) => void;
    isEditingSlug: boolean;
    setIsEditingSlug: (isEditing: boolean) => void;
    cloudAgents: CloudAgentsSelection;
    setCloudAgents: (agents: CloudAgentsSelection) => void;
    integrations: Integration[];
}

export function WorkerSlugHeader({ slug, setSlug, isEditingSlug, setIsEditingSlug, cloudAgents, setCloudAgents, integrations }: WorkerSlugHeaderProps) {
    return (
        <h2 className={styles.headerRow}>
            <div 
                className={styles.headerContainer}
                onClick={() => setIsEditingSlug(true)}
            >
                <div className={styles.autoResizeInput}>
                    <span className={styles.inputMirror}>{slug || " "}</span>
                    {isEditingSlug ? (
                        <input 
                            className={styles.slugInput}
                            value={slug} 
                            onChange={e => setSlug(e.target.value)}
                            onBlur={() => setIsEditingSlug(false)}
                            onKeyDown={e => e.key === 'Enter' && setIsEditingSlug(false)}
                            autoFocus
                        />
                    ) : (
                        <span className={styles.slugText}>{slug}</span>
                    )}
                </div>
                <button className={styles.editSlugButton}>
                    <BsPencil size={14} />
                </button>
            </div>
            <CloudAgentsDropdown
                integrations={integrations}
                value={cloudAgents}
                onChange={setCloudAgents}
            />
        </h2>
    );
}

