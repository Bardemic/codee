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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
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
        setError(null);
        try {
            if (worker) {
                await updateWorker({ id: worker.id, data: { prompt, slug, tool_slugs: selectedTools } }).unwrap();
            } else {
                await createWorker({ prompt, slug, tool_slugs: selectedTools }).unwrap();
            }
            onClose();
        } catch (err: unknown) {
            const message = err && typeof err === 'object' && 'data' in err 
                ? String((err as { data: { detail?: string } }).data?.detail || 'Failed to save worker')
                : 'Failed to save worker';
            setError(message);
        }
    };

    const handleDelete = async () => {
        if (!worker) return;
        setError(null);
        try {
            await deleteWorker(worker.id).unwrap();
            onClose();
        } catch (err: unknown) {
            const message = err && typeof err === 'object' && 'data' in err 
                ? String((err as { data: { detail?: string } }).data?.detail || 'Failed to delete worker')
                : 'Failed to delete worker';
            setError(message);
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
                    {error && <span className={styles.errorMessage}>{error}</span>}
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
