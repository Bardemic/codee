import { useState, useRef, useEffect, useMemo, useCallback, type ReactNode } from 'react';
import { BsSend, BsTools, BsCheck } from 'react-icons/bs';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';
import { IoClose, IoImage } from 'react-icons/io5';
import type { Integration, MessageImage } from '../../../lib/types';
import { PromptEditor, type PromptEditorRef } from './PromptEditor';
import { DropdownSelector, type DropdownOption } from './DropdownSelector';
import { CloudAgentsDropdown, type CloudAgentsSelection } from './CloudAgentsDropdown';
import styles from '../home.module.css';

interface ChatBoxProps {
    integrations: Integration[];
    onSubmit: (message: string, selectedTools: string[], images: MessageImage[]) => void;
    isLoading?: boolean;
    isDisabled?: boolean;
    placeholder?: string;
    leftPills?: ReactNode;
    resetKey?: number;
    cloudAgents: CloudAgentsSelection;
    onCloudAgentsChange: (sel: CloudAgentsSelection) => void;
    subAgents: boolean;
    onSubAgentsChange: (value: boolean) => void;
}

export interface ChatBoxRef {
    clear: () => void;
}

export function ChatBox({
    integrations,
    onSubmit,
    isLoading,
    isDisabled,
    placeholder,
    leftPills,
    resetKey,
    cloudAgents,
    onCloudAgentsChange,
    subAgents,
    onSubAgentsChange,
}: ChatBoxProps) {
    const [selectedTools, setSelectedTools] = useState<string[]>([]);
    const [attachedImages, setAttachedImages] = useState<MessageImage[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [hasContent, setHasContent] = useState(false);
    const editorRef = useRef<PromptEditorRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const isSubmitBlocked = isLoading || isDisabled;
    const isEmpty = !hasContent && attachedImages.length === 0;

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

    const toolsLabel = selectedTools.length === 0 ? 'Tools' : `${selectedTools.length} Tool${selectedTools.length > 1 ? 's' : ''} Selected`;

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
        const newImages: MessageImage[] = [];

        for (const file of Array.from(files)) {
            if (!validTypes.includes(file.type)) continue;
            if (file.size > 10 * 1024 * 1024) continue; // 10MB limit

            try {
                const base64 = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const result = reader.result as string;
                        const base64Data = result.split(',')[1];
                        resolve(base64Data);
                    };
                    reader.onerror = () => {
                        reject(new Error(`Failed to read file: ${file.name}`));
                    };
                    reader.readAsDataURL(file);
                });

                newImages.push({
                    data: base64,
                    mimeType: file.type,
                });
            } catch (error) {
                console.error('Error processing image file:', error);
            }
        }

        setAttachedImages((prev) => [...prev, ...newImages]);
    }, []);
    useEffect(() => {
        if (resetKey !== undefined) {
            editorRef.current?.clear();
            setSelectedTools([]);
            setAttachedImages([]);
            setHasContent(false);
        }
    }, [resetKey]);

    return (
        <div
            className={`${styles.chatBox} ${isDragging ? styles.chatBoxDragging : ''}`}
            onDragOver={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(true);
            }}
            onDragLeave={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(false);
            }}
            onDrop={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsDragging(false);
                processFiles(event.dataTransfer.files);
            }}
        >
            {isDragging && <div className={styles.dropOverlay} />}
            <div className={styles.chatToolbar}>
                <div className={styles.toolbarGroup}>
                    <CloudAgentsDropdown integrations={integrations} value={cloudAgents} onChange={onCloudAgentsChange} label="Agent/Provider" />
                    <DropdownSelector
                        icon={<BsTools size={14} />}
                        options={integrationDropdownOptions}
                        selectedValues={selectedTools}
                        onChange={setSelectedTools}
                        label={toolsLabel}
                        dropdownVariant="floating"
                    />
                </div>
                <div className={styles.toolbarGroup}>
                    <span className={styles.toggleLabel}>
                        Subagent Mode
                        <button
                            type="button"
                            className={`${styles.toggleButton} ${subAgents ? styles.toggleActive : ''}`}
                            onClick={() => onSubAgentsChange(!subAgents)}
                            aria-pressed={subAgents}
                        >
                            <span className={styles.toggleThumb} />
                        </button>
                    </span>
                </div>
            </div>
            {attachedImages.length > 0 && (
                <div className={styles.imagePreviewContainer}>
                    {attachedImages.map((image, index) => (
                        <div key={index} className={styles.imagePreview}>
                            <img src={`data:${image.mimeType};base64,${image.data}`} alt={`Attachment ${index + 1}`} />
                            <button
                                className={styles.removeImageButton}
                                onClick={() => setAttachedImages((prev) => prev.filter((_, imageIndex) => imageIndex !== index))}
                                type="button"
                            >
                                <IoClose size={14} />
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <PromptEditor
                ref={editorRef}
                integrations={integrations}
                onSelectedToolsChange={setSelectedTools}
                onSubmit={(message) => {
                    onSubmit(message, selectedTools, attachedImages);
                    setAttachedImages([]);
                    setHasContent(false);
                }}
                submitDisabled={isSubmitBlocked}
                placeholder={placeholder}
                onImagesPaste={processFiles}
                hasAttachments={attachedImages.length > 0}
                onContentChange={setHasContent}
            />
            <div className={styles.chatFooter}>
                <div className={styles.pillsContainer}>
                    {leftPills}
                    <button type="button" className={styles.attachButton} onClick={() => fileInputRef.current?.click()} title="Attach images">
                        <IoImage size={16} />
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        className={styles.hiddenFileInput}
                        accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                        multiple
                        onChange={(event) => event.target.files && processFiles(event.target.files)}
                    />
                </div>
                <button
                    className={styles.sendButton}
                    onClick={() => {
                        const message = editorRef.current?.getMessage().trim();
                        if (message || attachedImages.length > 0) {
                            onSubmit(message || '', selectedTools, attachedImages);
                            setAttachedImages([]);
                            setHasContent(false);
                        }
                    }}
                    disabled={isSubmitBlocked || isEmpty}
                >
                    {isLoading ? <AiOutlineLoading3Quarters size={16} className={styles.spinIcon} /> : <BsSend size={16} />}
                    <span>Send</span>
                </button>
            </div>
        </div>
    );
}
