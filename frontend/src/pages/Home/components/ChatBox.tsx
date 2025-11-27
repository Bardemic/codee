import { useState, useRef, useEffect, type ReactNode } from "react";
import { BsSend } from "react-icons/bs";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import type { Integration } from "../../../app/services/integrations/integrationsService";
import { PromptEditor, type PromptEditorRef } from "./PromptEditor";
import { ToolsSelector } from "./ToolsSelector";
import styles from "../home.module.css";

interface ChatBoxProps {
    integrations: Integration[];
    onSubmit: (message: string, selectedTools: string[]) => void;
    isLoading?: boolean;
    placeholder?: string;
    leftPills?: ReactNode;
    resetKey?: number;
}

export interface ChatBoxRef {
    clear: () => void;
}

export function ChatBox({ integrations, onSubmit, isLoading, placeholder, leftPills, resetKey }: ChatBoxProps) {
    const [selectedTools, setSelectedTools] = useState<string[]>([]);
    const editorRef = useRef<PromptEditorRef>(null);

    useEffect(() => {
        if (resetKey !== undefined) {
            editorRef.current?.clear();
            setSelectedTools([]);
        }
    }, [resetKey]);

    const handleSubmit = (message: string) => {
        onSubmit(message, selectedTools);
    };

    return (
        <div className={styles.chatBox}>
            <PromptEditor
                ref={editorRef}
                integrations={integrations}
                onSelectedToolsChange={setSelectedTools}
                onSubmit={handleSubmit}
                disabled={isLoading}
                placeholder={placeholder}
            />
            <div className={styles.chatFooter}>
                <div className={styles.pillsContainer}>
                    {leftPills}
                    <ToolsSelector
                        integrations={integrations}
                        selectedTools={selectedTools}
                        onChange={setSelectedTools}
                    />
                </div>
                <button
                    className={styles.sendButton}
                    onClick={() => {
                        const message = editorRef.current?.getMessage().trim();
                        if (message) handleSubmit(message);
                    }}
                    disabled={isLoading}
                >
                    {isLoading ? <AiOutlineLoading3Quarters size={16} className={styles.spinIcon} /> : <BsSend size={16} />}
                </button>
            </div>
        </div>
    );
}

