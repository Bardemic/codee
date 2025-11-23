import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { Integration } from '../../../app/services/integrations/integrationsService';
import type { SelectedTools } from '../Home';
import styles from '../home.module.css';

interface PromptEditorProps {
    integrations: Integration[];
    onSelectedToolsChange: (next: SelectedTools | ((prev: SelectedTools) => SelectedTools)) => void;
    onSubmit: (message: string) => void;
    disabled?: boolean;
    placeholder?: string;
}

export interface PromptEditorRef {
    getMessage: () => string;
    focus: () => void;
}

export interface MentionState {
    type: 'integration' | 'tool';
    query: string;
    anchorNode: Node;
    anchorOffset: number;
    integrationName?: string;
    position: { top: number; left: number };
    selectedIndex: number;
}

export interface MentionOption {
    label: string;
    value: string;
    type: 'integration' | 'tool';
}



export const PromptEditor = forwardRef<PromptEditorRef, PromptEditorProps>(function PromptEditor(
    { integrations, onSelectedToolsChange, onSubmit, disabled = false, placeholder },
    ref
) {
    const editorRef = useRef<HTMLDivElement>(null);
    const prevMentionsRef = useRef<string[]>([]);
    const [mentionState, setMentionState] = useState<MentionState | null>(null);

    useImperativeHandle(ref, () => ({
        getMessage: () => editorRef.current?.innerText ?? '',
        focus: () => editorRef.current?.focus(),
    }));

    const syncToolsFromPills = useCallback(
        (currentPills: string[]) => {
            const removed = prevMentionsRef.current.filter((pill) => !currentPills.includes(pill));
            if (removed.length === 0) return;

            onSelectedToolsChange((prev) => {
                const updated = { ...prev };
                
                removed.forEach((value) => {
                    if (value.includes('/')) {
                        const [integrationName, tool] = value.split('/');
                        const tools = updated[integrationName]?.filter((t) => t !== tool);
                        if (tools?.length) {
                            updated[integrationName] = tools;
                        } else {
                            delete updated[integrationName];
                        }
                    } else {
                        delete updated[value];
                    }
                });
                
                return updated;
            });
        },
        [onSelectedToolsChange]
    );

    const detectMentionTrigger = useCallback((): MentionState | null => {
        const selection = window.getSelection();
        if (!selection?.rangeCount) return null;

        const range = selection.getRangeAt(0);
        if (range.startContainer.nodeType !== Node.TEXT_NODE) return null;

        const textBeforeCursor = range.startContainer.textContent?.slice(0, range.startOffset) || '';
        const atIndex = textBeforeCursor.lastIndexOf('@');

        if (atIndex === -1 || (atIndex > 0 && !/\s/.test(textBeforeCursor[atIndex - 1]))) return null;

        const content = textBeforeCursor.slice(atIndex + 1);
        if (/\s/.test(content)) return null;

        const rect = range.getBoundingClientRect();
        const slashIndex = content.indexOf('/');
        const baseState = {
            anchorNode: range.startContainer,
            anchorOffset: atIndex,
            position: { top: rect.bottom, left: rect.left },
            selectedIndex: 0,
        };

        return slashIndex !== -1
            ? { ...baseState, type: 'tool', query: content.slice(slashIndex + 1), integrationName: content.slice(0, slashIndex) }
            : { ...baseState, type: 'integration', query: content };
    }, []);

    const handleInput = useCallback(() => {
        if (!editorRef.current) return;

        const currentPills = Array.from(editorRef.current.querySelectorAll(`.${styles.mentionPill}`))
            .map((pill) => pill.textContent?.substring(1) || '');

        syncToolsFromPills(currentPills);
        prevMentionsRef.current = currentPills;
        setMentionState(detectMentionTrigger());
    }, [detectMentionTrigger, syncToolsFromPills]);

    const handleSelectMention = useCallback(
        (value: string, type: 'integration' | 'tool') => {
            if (!mentionState || !editorRef.current) return;

            const selection = window.getSelection();
            if (!selection) return;

            const span = document.createElement('span');
            span.className = styles.mentionPill;
            span.textContent = `@${value}`;
            span.contentEditable = 'false';

            const queryLength = mentionState.query.length + (mentionState.type === 'tool' ? (mentionState.integrationName?.length || 0) + 1 : 0);
            const range = document.createRange();
            range.setStart(mentionState.anchorNode, mentionState.anchorOffset);
            range.setEnd(mentionState.anchorNode, mentionState.anchorOffset + 1 + queryLength);
            range.deleteContents();

            const space = document.createTextNode('\u00A0');
            range.insertNode(space);
            range.insertNode(span);
            range.setStartAfter(space);
            selection.removeAllRanges();
            selection.addRange(range);

            onSelectedToolsChange((prev) => {
                if (type === 'tool') {
                    const [integrationName, toolName] = value.split('/');
                    const current = prev[integrationName] || [];
                    return current.includes(toolName) ? prev : { ...prev, [integrationName]: [...current, toolName] };
                }
                const integration = integrations.find((item) => item.name === value);
                return integration ? { ...prev, [integration.name]: integration.tools.map((t) => t.display_name) } : prev;
            });

            prevMentionsRef.current = [...prevMentionsRef.current, value];
            setMentionState(null);
            editorRef.current.focus();
        },
        [integrations, mentionState, onSelectedToolsChange]
    );

    const mentionOptions = useMemo((): MentionOption[] => {
        if (!mentionState) return [];

        if (mentionState.type === 'integration') {
            return integrations
                .filter((integration) => integration.name.toLowerCase().includes(mentionState.query.toLowerCase()))
                .map((integration) => ({ label: integration.name, value: integration.name, type: 'integration' }));
        }

        const integration = integrations.find((item) => item.name.toLowerCase() === mentionState.integrationName?.toLowerCase());
        return (
            integration?.tools
                .filter((tool) => tool.display_name.toLowerCase().includes(mentionState.query.toLowerCase()))
                .map((tool) => ({ label: tool.display_name, value: `${integration.name}/${tool.display_name}`, type: 'tool' })) || []
        );
    }, [integrations, mentionState]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (mentionState && mentionOptions.length > 0) {
                const handlers: Record<string, () => void> = {
                    ArrowDown: () => setMentionState((prev) => prev ? { ...prev, selectedIndex: (prev.selectedIndex + 1) % mentionOptions.length } : null),
                    ArrowUp: () => setMentionState((prev) => prev ? { ...prev, selectedIndex: (prev.selectedIndex - 1 + mentionOptions.length) % mentionOptions.length } : null),
                    Tab: () => mentionOptions[mentionState.selectedIndex] && handleSelectMention(mentionOptions[mentionState.selectedIndex].value, mentionOptions[mentionState.selectedIndex].type),
                    Enter: () => mentionOptions[mentionState.selectedIndex] && handleSelectMention(mentionOptions[mentionState.selectedIndex].value, mentionOptions[mentionState.selectedIndex].type),
                    Escape: () => setMentionState(null),
                };

                if (handlers[event.key]) {
                    event.preventDefault();
                    handlers[event.key]();
                    return;
                }
            }

            if (event.key === 'Enter' && !event.shiftKey && !disabled) {
                event.preventDefault();
                const message = editorRef.current?.innerText.trim();
                if (message) onSubmit(message);
            }
        },
        [disabled, handleSelectMention, mentionOptions, mentionState, onSubmit]
    );

    return (
        <>
            <div
                className={styles.editor}
                contentEditable={!disabled}
                ref={editorRef}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                {...{ placeholder }}
            />

            {mentionState && mentionOptions.length > 0 && (
                <div
                    className={styles.mentionsDropdown}
                    style={{ top: mentionState.position.top + 8, left: mentionState.position.left }}
                >
                    {mentionOptions.map((option, index) => (
                        <div
                            key={option.value}
                            className={`${styles.mentionOption} ${index === mentionState.selectedIndex ? styles.active : ''}`}
                            onClick={() => handleSelectMention(option.value, option.type)}
                        >
                            {option.label}
                            <span className={styles.mentionType}>{option.type}</span>
                        </div>
                    ))}
                </div>
            )}
        </>
    );
});
