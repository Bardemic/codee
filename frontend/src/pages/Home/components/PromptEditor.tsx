import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type React from 'react';
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
    clear: () => void;
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
    const prevPillSlugsRef = useRef<string[]>([]);
    const [mentionState, setMentionState] = useState<MentionState | null>(null);

    useImperativeHandle(ref, () => ({
        getMessage: () => editorRef.current?.innerText ?? '',
        focus: () => editorRef.current?.focus(),
        clear: () => {
            if (editorRef.current) {
                editorRef.current.innerText = '';
                prevPillSlugsRef.current = [];
            }
        }
    }));

    const extractSlugsFromPill = useCallback((pill: Element): string[] => {
        const el = pill as HTMLSpanElement & { dataset: { toolSlug?: string; integrationSlugs?: string } };
        if (el.dataset.toolSlug) return [el.dataset.toolSlug];
        if (el.dataset.integrationSlugs) {
            try {
                return JSON.parse(el.dataset.integrationSlugs);
            } catch {
                return [];
            }
        }
        return [];
    }, []);

    const syncToolsFromPills = useCallback(
        (currentSlugsFromPills: string[]) => {
            const removedSlugs = prevPillSlugsRef.current.filter((slug) => !currentSlugsFromPills.includes(slug));
            if (removedSlugs.length === 0) return;

            onSelectedToolsChange((prev) => prev.filter((slug) => !removedSlugs.includes(slug)));
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

        const currentSlugsFromPills = Array.from(editorRef.current.querySelectorAll(`.${styles.mentionPill}`))
            .flatMap(extractSlugsFromPill);

        syncToolsFromPills(currentSlugsFromPills);
        prevPillSlugsRef.current = currentSlugsFromPills;
        setMentionState(detectMentionTrigger());
    }, [detectMentionTrigger, extractSlugsFromPill, syncToolsFromPills]);

    const handlePaste = useCallback((event: React.ClipboardEvent<HTMLDivElement>) => {
        event.preventDefault();
        const text = event.clipboardData.getData('text/plain');
        const selection = window.getSelection();
        if (!selection || !selection.rangeCount) return;
        const range = selection.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        handleInput();
    }, [handleInput]);

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
                    const [integrationName, toolDisplay] = value.split('/');
                    const integration = integrations.find((item) => item.name === integrationName);
                    const tool = integration?.tools.find((t) => t.display_name === toolDisplay);
                    if (!tool) return prev;
                    (span as HTMLSpanElement).dataset.toolSlug = tool.slug_name;
                    return prev.includes(tool.slug_name) ? prev : [...prev, tool.slug_name];
                }
                const integration = integrations.find((item) => item.name === value);
                if (!integration) return prev;
                const slugs = integration.tools.map((t) => t.slug_name);
                (span as HTMLSpanElement).dataset.integrationSlugs = JSON.stringify(slugs);
                const existing = new Set(prev);
                const toAdd = slugs.filter((slug) => !existing.has(slug));
                return toAdd.length ? [...prev, ...toAdd] : prev;
            });

            prevPillSlugsRef.current = [...prevPillSlugsRef.current, ...extractSlugsFromPill(span)];
            setMentionState(null);
            editorRef.current.focus();
        },
        [extractSlugsFromPill, integrations, mentionState, onSelectedToolsChange]
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
                onPaste={handlePaste}
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
