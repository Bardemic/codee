import { useCreateWorkerMutation, useUpdateWorkerMutation, useDeleteWorkerMutation, type Worker } from "../../../../app/services/workers/workersService";
import type { Integration } from "../../../../app/services/integrations/integrationsService";
import { useState, useEffect } from "react";
import styles from "./styles.module.css";
import { WorkerSlugHeader } from "./WorkerSlugHeader";
import { PromptSection } from "./PromptSection";
import { WebhookSection } from "./WebhookSection";
import { ToolsSection } from "./ToolsSection";

interface CreateWorkerModalProps {
    isOpen: boolean;
    onClose: () => void;
    integrations: Integration[];
    worker?: Worker | null;
}

export function CreateWorkerModal({ isOpen, onClose, integrations, worker }: CreateWorkerModalProps) {
    const [createWorker, { isLoading: isCreating }] = useCreateWorkerMutation();
    const [updateWorker, { isLoading: isUpdating }] = useUpdateWorkerMutation();
    const [deleteWorker, { isLoading: isDeleting }] = useDeleteWorkerMutation();

    const [prompt, setPrompt] = useState("");
    const [slug, setSlug] = useState("new-worker-slug");
    const [isEditingSlug, setIsEditingSlug] = useState(false);
    const [selectedIntegration, setSelectedIntegration] = useState("GitHub");
    const [selectedTools, setSelectedTools] = useState<string[]>([]);

    useEffect(() => {
        if (isOpen) {
            if (worker) {
                setSlug(worker.slug);
                setPrompt(worker.prompt);
                setSelectedTools(worker.tools.map(tool => tool.slug_name));
            } else {
                setSlug("new-worker-slug");
                setPrompt("");
                setSelectedTools([]);
            }
        }
    }, [isOpen, worker]);

    if (!isOpen) return null;

    const isLoading = isCreating || isUpdating || isDeleting;

    const handleSubmit = async () => {
        try {
            if (worker) {
                await updateWorker({ id: worker.id, data: { prompt, slug, tool_slugs: selectedTools } }).unwrap();
            } else {
                await createWorker({ prompt, slug, tool_slugs: selectedTools }).unwrap();
            }
            onClose();
        } catch (a) {console.log(a)}
    };

    const handleDelete = async () => {
        if (!worker) return;
        try {
            await deleteWorker(worker.id).unwrap();
            onClose();
        } catch (error) {
            console.error("Failed to delete worker", error);
        }
    };

    return (
        <div 
            className={styles.modalOverlay}
            onClick={onClose}
        >
            <div 
                className={styles.modalContent}
                onClick={e => e.stopPropagation()}
            >
                <WorkerSlugHeader 
                    slug={slug} 
                    setSlug={setSlug} 
                    isEditingSlug={isEditingSlug} 
                    setIsEditingSlug={setIsEditingSlug} 
                />

                <div className={styles.gridSection}>
                    <PromptSection prompt={prompt} setPrompt={setPrompt} />
                    
                    <WebhookSection 
                        slug={slug} 
                        selectedIntegration={selectedIntegration} 
                        setSelectedIntegration={setSelectedIntegration} 
                    />
                    
                    <ToolsSection 
                        integrations={integrations} 
                        selectedTools={selectedTools} 
                        setSelectedTools={setSelectedTools} 
                    />
                </div>
                <div className={styles.modalActions}>
                    {worker && (
                        <button 
                            className={styles.deleteButton} 
                            onClick={handleDelete}
                            disabled={isLoading}
                        >
                            Delete
                        </button>
                    )}
                    <div className={styles.buttonsBar}/>
                    <button className={styles.cancelButton} onClick={onClose}>Cancel</button>
                    <button onClick={handleSubmit} disabled={isLoading}>
                        {worker ? "Save" : "Create"}
                    </button>
                </div>   
            </div>
        </div>
    );
}
