import { BsPencil } from "react-icons/bs";
import styles from "./styles.module.css";

interface WorkerSlugHeaderProps {
    slug: string;
    setSlug: (slug: string) => void;
    isEditingSlug: boolean;
    setIsEditingSlug: (isEditing: boolean) => void;
}

export function WorkerSlugHeader({ slug, setSlug, isEditingSlug, setIsEditingSlug }: WorkerSlugHeaderProps) {
    return (
        <h2>
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
        </h2>
    );
}

