import { trpc } from '../../../../lib/trpc';
import type { Integration, Worker } from '../../../../lib/types';
import { useState, useEffect } from 'react';
import styles from './styles.module.css';
import { WorkerSlugHeader } from './WorkerSlugHeader';
import { PromptSection } from './PromptSection';
import { WebhookSection } from './WebhookSection';
import { ToolsSection } from './ToolsSection';

interface CreateWorkerModalProps {
    isOpen: boolean;
    onClose: () => void;
    integrations: Integration[];
    worker?: Worker | null;
}

export function CreateWorkerModal({ isOpen, onClose, integrations, worker }: CreateWorkerModalProps) {
    const utils = trpc.useUtils();
    const createWorker = trpc.workers.create.useMutation({
        onSuccess: () => utils.workers.list.invalidate(),
    });
    const updateWorker = trpc.workers.update.useMutation({
        onSuccess: () => utils.workers.list.invalidate(),
    });
    const deleteWorker = trpc.workers.delete.useMutation({
        onSuccess: () => utils.workers.list.invalidate(),
    });

    const [prompt, setPrompt] = useState('');
    const [slug, setSlug] = useState('new-worker-slug');
    const [isEditingSlug, setIsEditingSlug] = useState(false);
    const [selectedIntegration, setSelectedIntegration] = useState('GitHub');
    const [selectedTools, setSelectedTools] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (worker) {
                setSlug(worker.slug);
                setPrompt(worker.prompt);
                setSelectedTools(worker.tools.map((tool) => tool.slug_name));
            } else {
                setSlug('new-worker-slug');
                setPrompt('');
                setSelectedTools([]);
            }
        }
    }, [isOpen, worker]);

    if (!isOpen) return null;

    const isLoading = createWorker.isPending || updateWorker.isPending || deleteWorker.isPending;

    const handleSubmit = async () => {
        setError(null);
        try {
            const payload = {
                prompt,
                slug,
                tool_slugs: selectedTools,
                cloud_providers: [
                    {
                        name: 'Codee',
                        agents: [{ model: null }],
                    },
                ],
            };
            if (worker) {
                await updateWorker.mutateAsync({
                    id: worker.id,
                    ...payload,
                });
            } else {
                await createWorker.mutateAsync(payload);
            }
            onClose();
        } catch (err: unknown) {
            const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to save worker';
            setError(message);
        }
    };

    const handleDelete = async () => {
        if (!worker) return;
        setError(null);
        try {
            await deleteWorker.mutateAsync({ id: worker.id });
            onClose();
        } catch (err: unknown) {
            const message = err && typeof err === 'object' && 'message' in err ? String((err as { message: string }).message) : 'Failed to delete worker';
            setError(message);
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(event) => event.stopPropagation()}>
                <WorkerSlugHeader slug={slug} setSlug={setSlug} isEditingSlug={isEditingSlug} setIsEditingSlug={setIsEditingSlug} />

                <div className={styles.gridSection}>
                    <PromptSection prompt={prompt} setPrompt={setPrompt} />

                    <WebhookSection slug={slug} selectedIntegration={selectedIntegration} setSelectedIntegration={setSelectedIntegration} />

                    <ToolsSection integrations={integrations} selectedTools={selectedTools} setSelectedTools={setSelectedTools} />
                </div>
                <div className={styles.modalActions}>
                    {worker && (
                        <button className={styles.deleteButton} onClick={handleDelete} disabled={isLoading}>
                            Delete
                        </button>
                    )}
                    {error && <span className={styles.errorMessage}>{error}</span>}
                    <div className={styles.buttonsBar} />
                    <button className={styles.cancelButton} onClick={onClose}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={isLoading}>
                        {worker ? 'Save' : 'Create'}
                    </button>
                </div>
            </div>
        </div>
    );
}
