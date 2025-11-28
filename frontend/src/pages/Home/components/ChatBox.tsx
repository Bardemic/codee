import { useState, useRef, useEffect, useMemo, type ReactNode } from "react";
import { BsSend, BsRobot, BsTools } from "react-icons/bs";
import { AiOutlineLoading3Quarters } from "react-icons/ai";
import type { Integration } from "../../../app/services/integrations/integrationsService";
import { PromptEditor, type PromptEditorRef } from "./PromptEditor";
import { DropdownSelector, type DropdownOption } from "./DropdownSelector";
import styles from "../home.module.css";

interface ChatBoxProps {
    integrations: Integration[];
    onSubmit: (message: string, selectedTools: string[]) => void;
    isLoading?: boolean;
    placeholder?: string;
    leftPills?: ReactNode;
    resetKey?: number;
    selectedProviders: string[];
    onProvidersChange: (providers: string[]) => void;
}

export interface ChatBoxRef {
    clear: () => void;
}

export function ChatBox({ integrations, onSubmit, isLoading, placeholder, leftPills, resetKey, selectedProviders, onProvidersChange }: ChatBoxProps) {
    const [selectedTools, setSelectedTools] = useState<string[]>([]);
    const editorRef = useRef<PromptEditorRef>(null);

    const providerDropdownOptions = useMemo<DropdownOption[]>(() => {
        const seen = new Set<string>();
        return integrations.reduce<DropdownOption[]>((acc, integration) => {
            const provider = integration.name;
            if (!provider || seen.has(provider) || !integration.has_cloud_agent) return acc;
            seen.add(provider);
            acc.push({ id: provider, label: provider, value: provider });
            return acc;
        }, []);
    }, [integrations]);

    const integrationDropdownOptions = useMemo<DropdownOption[]>(() => 
        integrations.filter(integration => integration.tools.length > 0).map((integration) => ({
            id: integration.name,
            label: integration.name,
            children: integration.tools.map((tool) => ({
                id: tool.slug_name,
                label: tool.display_name,
                value: tool.slug_name,
            })),
        }))
    , [integrations]);

    const providerLabel = selectedProviders.length === 0
        ? "Select Providers"
        : `${selectedProviders.length} Provider${selectedProviders.length > 1 ? "s" : ""}`;

    const toolsLabel = selectedTools.length === 0
        ? "Select Tools"
        : `${selectedTools.length} Tool${selectedTools.length > 1 ? "s" : ""} Selected`;

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
                    <DropdownSelector
                        icon={<BsRobot size={14} />}
                        options={providerDropdownOptions}
                        selectedValues={selectedProviders}
                        onChange={onProvidersChange}
                        label={providerLabel}
                    />
                    <DropdownSelector
                        icon={<BsTools size={14} />}
                        options={integrationDropdownOptions}
                        selectedValues={selectedTools}
                        onChange={setSelectedTools}
                        label={toolsLabel}
                        dropdownVariant="floating"
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

