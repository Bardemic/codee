import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { BsChevronDown, BsChevronRight, BsCheck } from 'react-icons/bs';
import styles from '../home.module.css';
import type { Integration } from '../../../app/services/integrations/integrationsService';
import type { SelectedTools } from '../Home';

interface ToolsSelectorProps {
    integrations: Integration[];
    selectedTools: SelectedTools;
    onChange: (tools: SelectedTools) => void;
}

export function ToolsSelector({ integrations, selectedTools, onChange }: ToolsSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedIntegrations, setExpandedIntegrations] = useState<string[]>([]);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: globalThis.MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleExpand = (name: string, e?: ReactMouseEvent) => {
        e?.stopPropagation();
        setExpandedIntegrations((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
    };

    const toggleIntegration = (integration: Integration, e: ReactMouseEvent) => {
        e.stopPropagation();
        const integrationToolSlugs = integration.tools.map((t) => t.slug_name);
        const selectedSet = new Set(selectedTools);
        const selectedCount = integrationToolSlugs.filter((slug) => selectedSet.has(slug)).length;
        const allSelected = integration.tools.length > 0 && selectedCount === integration.tools.length;

        if (allSelected) {
            onChange(selectedTools.filter((slug) => !integrationToolSlugs.includes(slug)));
        } else {
            const toAdd = integrationToolSlugs.filter((slug) => !selectedSet.has(slug));
            onChange([...selectedTools, ...toAdd]);
        }

        if (!allSelected && !expandedIntegrations.includes(integration.name)) {
            setExpandedIntegrations((prev) => [...prev, integration.name]);
        }
    };

    const toggleTool = (toolSlug: string) => {
        const isSelected = selectedTools.includes(toolSlug);
        const next = isSelected
            ? selectedTools.filter((slug) => slug !== toolSlug)
            : [...selectedTools, toolSlug];
        onChange(next);
    };

    const totalSelected = useMemo(() => selectedTools.length, [selectedTools]);
    const selectedSetForRender = useMemo(() => new Set(selectedTools), [selectedTools]);

    return (
        <div className={styles.toolsPillContainer} ref={containerRef} onClick={() => setIsOpen((prev) => !prev)}>
            {totalSelected > 0 ? `${totalSelected} Tools Selected` : 'Select Tools'}

            {isOpen && (
                <div className={styles.toolsDropdown} onClick={(e) => e.stopPropagation()}>
                    {integrations.map((integration) => {
                        const selectedCount = integration.tools.filter((t) => selectedSetForRender.has(t.slug_name)).length;
                        const isAllSelected = integration.tools.length > 0 && selectedCount === integration.tools.length;
                        const isPartial = selectedCount > 0 && !isAllSelected;
                        const isExpanded = expandedIntegrations.includes(integration.name);

                        return (
                            <div key={integration.name} className={styles.integrationItem}>
                                <div className={styles.integrationHeader} onClick={(e) => toggleExpand(integration.name, e)}>
                                    <div className={styles.integrationName}>
                                        <div
                                            className={`${styles.checkbox} ${isAllSelected || isPartial ? styles.checked : ''}`}
                                            onClick={(e) => toggleIntegration(integration, e)}
                                        >
                                            {(isAllSelected || isPartial) && <BsCheck size={12} />}
                                        </div>
                                        {integration.name}
                                    </div>
                                    <div className={styles.expandIcon}>
                                        {isExpanded ? <BsChevronDown /> : <BsChevronRight />}
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className={styles.toolList}>
                                        {integration.tools.map((tool) => (
                                            <div
                                                key={tool.id}
                                                className={styles.toolItem}
                                                onClick={() => toggleTool(tool.slug_name)}
                                            >
                                                <div className={`${styles.checkbox} ${selectedTools.includes(tool.slug_name) ? styles.checked : ''}`}>
                                                    {selectedTools.includes(tool.slug_name) && <BsCheck size={12} />}
                                                </div>
                                                {tool.display_name}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
