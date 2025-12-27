import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Integration, Tool } from '../../../lib/types';
import { BsChevronDown, BsChevronRight, BsCheck } from 'react-icons/bs';
import styles from '../home.module.css';

export type CloudAgent = { model: string; tools: string[] };
export type CloudAgentsSelection = {
    providers: Array<{ name: string; agents: CloudAgent[] }>;
};

interface CloudAgentsDropdownProps {
    integrations: Integration[];
    value: CloudAgentsSelection;
    onChange: (val: CloudAgentsSelection) => void;
    label?: string;
}

export function CloudAgentsDropdown({ integrations, value, onChange, label }: CloudAgentsDropdownProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [expanded, setExpanded] = useState<string[]>([]);
    const [openModelKey, setOpenModelKey] = useState<string | null>(null);
    const [menuPos, setMenuPos] = useState<{
        top?: number;
        bottom?: number;
        left: number;
    } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const providerModels = useMemo(() => {
        const map = new Map<string, Tool[]>();
        for (const integration of integrations) {
            const showProvider = integration.has_cloud_agent && (integration.name === 'Codee' || integration.connected);
            if (showProvider) {
                map.set(
                    integration.name,
                    integration.tools.filter((tool) => tool.is_model)
                );
            }
        }
        return map;
    }, [integrations]);

    useEffect(() => {
        const handleClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if ([containerRef, dropdownRef, menuRef].some((ref) => ref.current?.contains(target))) return;
            setIsOpen(false);
            setOpenModelKey(null);
        };
        const handleCloseMenu = () => setOpenModelKey(null);
        document.addEventListener('mousedown', handleClick);
        window.addEventListener('scroll', handleCloseMenu, true);
        window.addEventListener('resize', handleCloseMenu);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            window.removeEventListener('scroll', handleCloseMenu, true);
            window.removeEventListener('resize', handleCloseMenu);
        };
    }, []);

    useEffect(() => {
        const keys = Array.from(providerModels.keys());
        if (keys.length && !expanded.length) setExpanded(keys);
    }, [providerModels, expanded.length]);

    const summary = useMemo(() => {
        const providers = value.providers.filter((p) => p.agents.length > 0);
        const agents = value.providers.reduce((n, p) => n + p.agents.length, 0);
        if (!agents) return label ?? 'Select Cloud Agents';
        return `${agents} agent${agents > 1 ? 's' : ''}, ${providers.length} provider${providers.length > 1 ? 's' : ''}`;
    }, [value, label]);

    const updateAgents = useCallback(
        (name: string, delta: number) => {
            setOpenModelKey(null);
            const models = providerModels.get(name);
            const defaultModel = models?.[0]?.slug_name ?? '';
            const existing = value.providers.find((provider) => provider.name === name);
            if (!existing && delta > 0) {
                onChange({
                    providers: [
                        ...value.providers,
                        {
                            name,
                            agents: [
                                {
                                    model: defaultModel,
                                    tools: [],
                                },
                            ],
                        },
                    ],
                });
                return;
            }
            onChange({
                providers: value.providers.map((provider) => {
                    if (provider.name !== name) return provider;
                    if (delta > 0)
                        return {
                            ...provider,
                            agents: [
                                ...provider.agents,
                                {
                                    model: defaultModel,
                                    tools: [],
                                },
                            ],
                        };
                    return provider.agents.length
                        ? {
                              ...provider,
                              agents: provider.agents.slice(0, -1),
                          }
                        : provider;
                }),
            });
        },
        [providerModels, value.providers, onChange]
    );

    const setModel = (providerName: string, agentIndex: number, modelName: string) => {
        onChange({
            providers: value.providers.map((provider) =>
                provider.name === providerName
                    ? {
                          ...provider,
                          agents: provider.agents.map((agent, index) =>
                              index === agentIndex
                                  ? {
                                        ...agent,
                                        model: modelName,
                                    }
                                  : agent
                          ),
                      }
                    : provider
            ),
        });
    };

    const openMenu = (event: React.MouseEvent, menuKey: string) => {
        event.stopPropagation();
        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        const left = Math.min(rect.left, window.innerWidth - 248);

        if (rect.bottom + 6 + 240 > window.innerHeight) {
            setMenuPos({
                bottom: window.innerHeight - rect.top + 6,
                left,
            });
        } else {
            setMenuPos({ top: rect.bottom + 6, left });
        }
        setOpenModelKey((currentKey) => (currentKey === menuKey ? null : menuKey));
    };

    return (
        <div
            ref={containerRef}
            className={styles.pillContainer}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((v) => !v)}
        >
            {summary}
            {isOpen && (
                <div ref={dropdownRef} className={`${styles.dropdownContainer} ${styles.cloudAgentsDropdown}`} onClick={(e) => e.stopPropagation()}>
                    {Array.from(providerModels.entries()).map(([providerName, models]) => {
                        const isExpanded = expanded.includes(providerName);
                        const agents = value.providers.find((provider) => provider.name === providerName)?.agents ?? [];
                        return (
                            <div key={providerName} className={styles.integrationItem}>
                                <div
                                    className={styles.integrationHeader}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setOpenModelKey(null);
                                        setExpanded((prevExpanded) =>
                                            isExpanded ? prevExpanded.filter((name) => name !== providerName) : [...prevExpanded, providerName]
                                        );
                                    }}
                                >
                                    <div className={styles.integrationName}>{providerName}</div>
                                    <div className={styles.headerControls} onClick={(event) => event.stopPropagation()}>
                                        <div className={styles.numberControl}>
                                            <button
                                                className={styles.numberButton}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => updateAgents(providerName, -1)}
                                                aria-label="decrease"
                                            >
                                                -
                                            </button>
                                            <div className={styles.numberValue}>{agents.length}</div>
                                            <button
                                                className={styles.numberButton}
                                                onMouseDown={(event) => event.preventDefault()}
                                                onClick={() => {
                                                    updateAgents(providerName, 1);
                                                    if (!isExpanded) setExpanded((prevExpanded) => [...prevExpanded, providerName]);
                                                }}
                                                aria-label="increase"
                                            >
                                                +
                                            </button>
                                        </div>
                                        <div className={styles.expandIcon}>{isExpanded ? <BsChevronDown /> : <BsChevronRight />}</div>
                                    </div>
                                </div>
                                {isExpanded && agents.length > 0 && (
                                    <div className={`${styles.toolList} ${styles.providerContent}`} onClick={() => setOpenModelKey(null)}>
                                        {agents.map((agent, agentIndex) => (
                                            <div key={agentIndex} className={styles.agentBlock}>
                                                <div className={styles.agentRow}>
                                                    <div className={styles.agentSectionLabel}>Agent {agentIndex + 1}</div>
                                                    <div className={styles.modelSelectWrap}>
                                                        {models.length > 0 ? (
                                                            <>
                                                                <button
                                                                    className={styles.modelSelectButton}
                                                                    onMouseDown={(event) => event.preventDefault()}
                                                                    onClick={(event) => openMenu(event, `${providerName}:${agentIndex}`)}
                                                                >
                                                                    {models.find((model) => model.slug_name === agent.model)?.display_name || 'Select model'}
                                                                    <BsChevronDown size={12} />
                                                                </button>
                                                                {openModelKey === `${providerName}:${agentIndex}` &&
                                                                    menuPos &&
                                                                    createPortal(
                                                                        <div
                                                                            ref={menuRef}
                                                                            className={styles.modelMenu}
                                                                            style={{
                                                                                top: menuPos.top,
                                                                                bottom: menuPos.bottom,
                                                                                left: menuPos.left,
                                                                            }}
                                                                            onMouseDown={(event) => {
                                                                                event.stopPropagation();
                                                                                event.preventDefault();
                                                                            }}
                                                                            onClick={(event) => event.stopPropagation()}
                                                                        >
                                                                            {models.map((model) => (
                                                                                <div
                                                                                    key={model.slug_name}
                                                                                    className={`${styles.dropdownOption} ${agent.model === model.slug_name ? styles.selectedOption : ''}`}
                                                                                    onClick={() => {
                                                                                        setModel(providerName, agentIndex, model.slug_name);
                                                                                        setOpenModelKey(null);
                                                                                    }}
                                                                                >
                                                                                    <div
                                                                                        className={`${styles.checkbox} ${agent.model === model.slug_name ? styles.checked : ''}`}
                                                                                    >
                                                                                        {agent.model === model.slug_name && <BsCheck size={12} />}
                                                                                    </div>
                                                                                    {model.display_name}
                                                                                </div>
                                                                            ))}
                                                                        </div>,
                                                                        document.body
                                                                    )}
                                                            </>
                                                        ) : (
                                                            <span className={styles.defaultModelLabel}>Default</span>
                                                        )}
                                                    </div>
                                                </div>
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
