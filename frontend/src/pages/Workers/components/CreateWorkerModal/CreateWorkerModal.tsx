import { useCreateWorkerMutation, useUpdateWorkerMutation, useDeleteWorkerMutation, type Worker, type ProviderConfig } from "../../../../app/services/workers/workersService";
import type { Integration } from "../../../../app/services/integrations/integrationsService";
import { useState, useEffect, useMemo } from "react";
import styles from "./styles.module.css";
import { WorkerSlugHeader } from "./WorkerSlugHeader";
import { PromptSection } from "./PromptSection";
import { WebhookSection } from "./WebhookSection";
import { ToolsSection } from "./ToolsSection";
import type { CloudAgentsSelection } from "../../../Home/components/CloudAgentsDropdown";

const DEFAULT_CLOUD_AGENTS: CloudAgentsSelection = { providers: [{agents: [{model: "auto.5", tools: []}], name: "Codee"}] };

function toCloudAgentsSelection(providers: ProviderConfig[] | undefined): CloudAgentsSelection {
    if (!providers || providers.length === 0) return DEFAULT_CLOUD_AGENTS;
    return {
        providers: providers.map(p => ({
            name: p.name,
            agents: p.agents.map(a => ({ model: a.model || "", tools: [] }))
        }))
    };
}

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
    const [cloudAgents, setCloudAgents] = useState<CloudAgentsSelection>(DEFAULT_CLOUD_AGENTS);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (worker) {
                setSlug(worker.slug);
                setPrompt(worker.prompt);
                setSelectedTools(worker.tools.map(tool => tool.slug_name));
                setCloudAgents(toCloudAgentsSelection(worker.cloud_providers));
            } else {
                setSlug("new-worker-slug");
                setPrompt("");
                setSelectedTools([]);
                setCloudAgents(DEFAULT_CLOUD_AGENTS);
            }
        }
    }, [isOpen, worker]);

    const activeProviders = useMemo(() => {
        return cloudAgents.providers
            .filter(p => (p.agents?.length ?? 0) > 0)
            .map(p => ({
                name: p.name,
                agents: p.agents.map(a => ({ model: a.model || null }))
            }));
    }, [cloudAgents]);

    if (!isOpen) return null;

    const isLoading = isCreating || isUpdating || isDeleting;

    const handleSubmit = async () => {
        setError(null);
        try {
            const payload = { prompt, slug, tool_slugs: selectedTools, cloud_providers: activeProviders };
            if (worker) {
                await updateWorker({ id: worker.id, data: payload }).unwrap();
            } else {
                await createWorker(payload).unwrap();
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
                    cloudAgents={cloudAgents}
                    setCloudAgents={setCloudAgents}
                    integrations={integrations}
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
