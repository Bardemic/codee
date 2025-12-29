import { useState, useRef, useEffect, useMemo, type ReactNode } from 'react';
import { BsSend, BsTools } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import type { Integration } from '../../../lib/types';
import { PromptEditor, type PromptEditorRef } from './PromptEditor';
import { DropdownSelector, type DropdownOption } from './DropdownSelector';
import { CloudAgentsDropdown, type CloudAgentsSelection } from './CloudAgentsDropdown';
import styles from '../home.module.css';

interface ChatBoxProps {
    integrations: Integration[];
    onSubmit: (message: string, selectedTools: string[]) => void;
    isLoading?: boolean;
    isDisabled?: boolean;
    placeholder?: string;
    leftPills?: ReactNode;
    resetKey?: number;
    cloudAgents: CloudAgentsSelection;
    onCloudAgentsChange: (sel: CloudAgentsSelection) => void;
}

export interface ChatBoxRef {
    clear: () => void;
}

export function ChatBox({ integrations, onSubmit, isLoading, isDisabled, placeholder, leftPills, resetKey, cloudAgents, onCloudAgentsChange }: ChatBoxProps) {
    const [selectedTools, setSelectedTools] = useState<string[]>([]);
    const editorRef = useRef<PromptEditorRef>(null);
    const isBlocked = Boolean(isLoading || isDisabled);

    const integrationDropdownOptions = useMemo<DropdownOption[]>(
        () =>
            integrations
                .filter((integration) => !integration.has_cloud_agent && integration.tools.length > 0)
                .map((integration) => ({
                    id: integration.name,
                    label: integration.name,
                    children: integration.tools.map((tool) => ({
                        id: tool.slug_name,
                        label: tool.display_name,
                        value: tool.slug_name,
                    })),
                })),
        [integrations]
    );

    const toolsLabel = selectedTools.length === 0 ? 'Select Tools' : `${selectedTools.length} Tool${selectedTools.length > 1 ? 's' : ''} Selected`;

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
                disabled={isBlocked}
                placeholder={placeholder}
            />
            <div className={styles.chatFooter}>
                <div className={styles.pillsContainer}>
                    {leftPills}
                    <CloudAgentsDropdown integrations={integrations} value={cloudAgents} onChange={onCloudAgentsChange} />
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
                    disabled={isBlocked}
                >
                    {isLoading ? <AiOutlineLoading3Quarters size={16} className={styles.spinIcon} /> : <BsSend size={16} />}
                </button>
            </div>
        </div>
    );
}
