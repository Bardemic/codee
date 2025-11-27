import { useState, type MouseEvent as ReactMouseEvent } from "react";
import { BsCheck, BsChevronDown, BsChevronRight } from "react-icons/bs";
import type { Integration } from "../../../../app/services/integrations/integrationsService";
import styles from "./styles.module.css";

interface ToolsSectionProps {
    integrations: Integration[];
    selectedTools: string[];
    setSelectedTools: React.Dispatch<React.SetStateAction<string[]>>;
}

export function ToolsSection({ integrations, selectedTools, setSelectedTools }: ToolsSectionProps) {
    const [expandedIntegrations, setExpandedIntegrations] = useState<string[]>([]);
    
    const toggleExpand = (name: string) => {
        setExpandedIntegrations((prev) => prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]);
    };

    const toggleIntegration = (integration: Integration, e: ReactMouseEvent) => {
        e.stopPropagation();
        const integrationToolSlugs = integration.tools.map((tool) => tool.slug_name);
        const selectedSet = new Set(selectedTools);
        const selectedCount = integrationToolSlugs.filter((slug) => selectedSet.has(slug)).length;
        const allSelected = integration.tools.length > 0 && selectedCount === integration.tools.length;

        if (allSelected) {
            setSelectedTools(prev => prev.filter((slug) => !integrationToolSlugs.includes(slug)));
        } else {
            const toAdd = integrationToolSlugs.filter((slug) => !selectedSet.has(slug));
            setSelectedTools(prev => [...prev, ...toAdd]);
        }

        if (!allSelected && !expandedIntegrations.includes(integration.name)) {
            setExpandedIntegrations((prev) => [...prev, integration.name]);
        }
    };

    const toggleTool = (toolSlug: string) => {
        const isSelected = selectedTools.includes(toolSlug);
        setSelectedTools(prev => isSelected
            ? prev.filter((slug) => slug !== toolSlug)
            : [...prev, toolSlug]
        );
    };

    const selectedSetForRender = new Set(selectedTools);

    return (
        <div className={styles.toolsWrapper}>
            <div className={styles.toolsHeader}>Tools <span className={styles.toolHeaderSub}>({selectedTools.length} selected)</span></div>
            <div className={styles.toolsList}>
            {integrations.map((integration) => {
                const selectedCount = integration.tools.filter((t) => selectedSetForRender.has(t.slug_name)).length;
                const isAllSelected = integration.tools.length > 0 && selectedCount === integration.tools.length;
                const isPartial = selectedCount > 0 && !isAllSelected;
                const isExpanded = expandedIntegrations.includes(integration.name);

                return (
                    <div key={integration.name} className={styles.integrationItem}>
                        <div className={styles.integrationHeader} onClick={() => toggleExpand(integration.name)}>
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
        </div>
    );
}

