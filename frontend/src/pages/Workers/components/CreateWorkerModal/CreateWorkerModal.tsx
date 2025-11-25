import { useCreateWorkerMutation } from "../../../../app/services/workers/workersService";
import type { Integration } from "../../../../app/services/integrations/integrationsService";
import { ChatBox } from "../../../Home/components/ChatBox";
import { useState, useEffect } from "react";
import styles from "../../workers.module.css";
import { BsX } from "react-icons/bs";

interface CreateWorkerModalProps {
    isOpen: boolean;
    onClose: () => void;
    integrations: Integration[];
}

export function CreateWorkerModal({ isOpen, onClose, integrations }: CreateWorkerModalProps) {
    const [createWorker, { isLoading: isCreating }] = useCreateWorkerMutation();
    const [resetKey, setResetKey] = useState(0);

    useEffect(() => {
        if (!isOpen) {
            setResetKey(k => k + 1);
        }
    }, [isOpen]);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, onClose]);

    const handleSubmit = async (message: string, selectedTools: string[]) => {
        try {
            await createWorker({ prompt: message, tool_slugs: selectedTools }).unwrap();
            onClose();
        } catch (e) {
            console.error(e);
        }
    };

    if (!isOpen) return null;

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
                <div className={styles.modalHeader}>
                    <h2>Create New Worker</h2>
                    <button className={styles.closeButton} onClick={onClose}>
                        <BsX size={24} />
                    </button>
                </div>
                <div className={styles.modalBody}>
                    <ChatBox
                        integrations={integrations}
                        onSubmit={handleSubmit}
                        isLoading={isCreating}
                        placeholder="Describe what this worker should do..."
                        resetKey={resetKey}
                    />
                </div>
            </div>
        </div>
    );
}
