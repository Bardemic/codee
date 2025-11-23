import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
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
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleExpand = (name: string, e?: MouseEvent) => {
        e?.stopPropagation();
        setExpandedIntegrations((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
    };

    const toggleIntegration = (integration: Integration, e: MouseEvent) => {
        e.stopPropagation();
        const currentTools = selectedTools[integration.name] || [];
        const allSelected = integration.tools.length > 0 && currentTools.length === integration.tools.length;

        if (allSelected) {
            const next = { ...selectedTools };
            delete next[integration.name];
            onChange(next);
        } else {
            onChange({ ...selectedTools, [integration.name]: integration.tools.map((t) => t.display_name) });
        }

        if (!allSelected && !expandedIntegrations.includes(integration.name)) {
            setExpandedIntegrations((prev) => [...prev, integration.name]);
        }
    };

    const toggleTool = (integrationName: string, tool: string) => {
        const current = selectedTools[integrationName] || [];
        const updated = current.includes(tool) ? current.filter((t) => t !== tool) : [...current, tool];

        if (updated.length === 0) {
            const next = { ...selectedTools };
            delete next[integrationName];
            onChange(next);
        } else {
            onChange({ ...selectedTools, [integrationName]: updated });
        }
    };

    const totalSelected = useMemo(
        () => Object.values(selectedTools).reduce((acc, tools) => acc + tools.length, 0),
        [selectedTools]
    );

    return (
        <div className={styles.toolsPillContainer} ref={containerRef} onClick={() => setIsOpen((prev) => !prev)}>
            {totalSelected > 0 ? `${totalSelected} Tools Selected` : 'Select Tools'}

            {isOpen && (
                <div className={styles.toolsDropdown} onClick={(e) => e.stopPropagation()}>
                    {integrations.map((integration) => {
                        const currentTools = selectedTools[integration.name] || [];
                        const isAllSelected = integration.tools.length > 0 && currentTools.length === integration.tools.length;
                        const isPartial = currentTools.length > 0 && !isAllSelected;
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
                                                onClick={() => toggleTool(integration.name, tool.display_name)}
                                            >
                                                <div className={`${styles.checkbox} ${currentTools.includes(tool.display_name) ? styles.checked : ''}`}>
                                                    {currentTools.includes(tool.display_name) && <BsCheck size={12} />}
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
