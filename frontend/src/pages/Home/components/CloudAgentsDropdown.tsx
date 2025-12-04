import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Integration, Tool } from "../../../app/services/integrations/integrationsService";
import { BsChevronDown, BsChevronRight, BsCheck } from "react-icons/bs";
import styles from "../home.module.css";

export type CloudAgent = { model: string; tools: string[] };
export type CloudAgentsSelection = { providers: Array<{ name: string; agents: CloudAgent[] }> };

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
    const [menuPos, setMenuPos] = useState<{ top?: number; bottom?: number; left: number } | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const providerModels = useMemo(() => {
        const map = new Map<string, Tool[]>();
        for (const i of (integrations || []).filter(i => i.has_cloud_agent)) {
            map.set(i.name, (i.tools || []).filter(t => t.is_model));
        }
        return map;
    }, [integrations]);

    useEffect(() => {
        const closeMenu = () => setOpenModelKey(null);
        const handleClick = (e: MouseEvent) => {
            const t = e.target as Node;
            if ([containerRef, dropdownRef, menuRef].some(r => r.current?.contains(t))) return;
            setIsOpen(false);
            closeMenu();
        };
        document.addEventListener("mousedown", handleClick);
        window.addEventListener("scroll", closeMenu, true);
        window.addEventListener("resize", closeMenu);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            window.removeEventListener("scroll", closeMenu, true);
            window.removeEventListener("resize", closeMenu);
        };
    }, []);

    useEffect(() => {
        const keys = Array.from(providerModels.keys());
        if (keys.length && !expanded.length) setExpanded(keys);
    }, [providerModels, expanded.length]);

    const summary = useMemo(() => {
        const providers = value.providers.filter(p => p.agents.length > 0);
        const agents = value.providers.reduce((n, p) => n + p.agents.length, 0);
        if (!agents) return label ?? "Select Cloud Agents";
        return `${agents} agent${agents > 1 ? "s" : ""}, ${providers.length} provider${providers.length > 1 ? "s" : ""}`;
    }, [value, label]);

    const updateAgents = (name: string, delta: number) => {
        setOpenModelKey(null);
        const models = providerModels.get(name);
        const defaultModel = models?.[0]?.slug_name ?? "";
        const existing = value.providers.find(p => p.name === name);
        if (!existing && delta > 0) {
            onChange({ providers: [...value.providers, { name, agents: [{ model: defaultModel, tools: [] }] }] });
            return;
        }
        onChange({
            providers: value.providers.map(p => {
                if (p.name !== name) return p;
                if (delta > 0) return { ...p, agents: [...p.agents, { model: defaultModel, tools: [] }] };
                return p.agents.length ? { ...p, agents: p.agents.slice(0, -1) } : p;
            })
        });
    };

    const setModel = (name: string, idx: number, model: string) => {
        onChange({
            providers: value.providers.map(p =>
                p.name === name ? { ...p, agents: p.agents.map((a, i) => i === idx ? { ...a, model } : a) } : p
            )
        });
    };

    const openMenu = (e: React.MouseEvent, key: string) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const left = Math.min(rect.left, window.innerWidth - 248);

        if (rect.bottom + 6 + 240 > window.innerHeight) {
            setMenuPos({ bottom: window.innerHeight - rect.top + 6, left });
        } else {
            setMenuPos({ top: rect.bottom + 6, left });
        }
        setOpenModelKey(prev => prev === key ? null : key);
    };

    return (
        <div ref={containerRef} className={styles.pillContainer} role="button" aria-haspopup="listbox" aria-expanded={isOpen} onClick={() => setIsOpen(v => !v)}>
            {summary}
            {isOpen && (
                <div ref={dropdownRef} className={`${styles.dropdownContainer} ${styles.cloudAgentsDropdown}`} onClick={e => e.stopPropagation()}>
                    {Array.from(providerModels.entries()).map(([name, models]) => {
                        const isExp = expanded.includes(name);
                        const agents = value.providers.find(p => p.name === name)?.agents ?? [];
                        return (
                            <div key={name} className={styles.integrationItem}>
                                <div className={styles.integrationHeader} onClick={e => { e.stopPropagation(); setOpenModelKey(null); setExpanded(prev => isExp ? prev.filter(x => x !== name) : [...prev, name]); }}>
                                    <div className={styles.integrationName}>{name}</div>
                                    <div className={styles.headerControls} onClick={e => e.stopPropagation()}>
                                        <div className={styles.numberControl}>
                                            <button className={styles.numberButton} onMouseDown={e => e.preventDefault()} onClick={() => updateAgents(name, -1)} aria-label="decrease">-</button>
                                            <div className={styles.numberValue}>{agents.length}</div>
                                            <button className={styles.numberButton} onMouseDown={e => e.preventDefault()} onClick={() => { updateAgents(name, 1); if (!isExp) setExpanded(p => [...p, name]); }} aria-label="increase">+</button>
                                        </div>
                                        <div className={styles.expandIcon}>{isExp ? <BsChevronDown /> : <BsChevronRight />}</div>
                                    </div>
                                </div>
                                {isExp && agents.length > 0 && (
                                    <div className={`${styles.toolList} ${styles.providerContent}`} onClick={() => setOpenModelKey(null)}>
                                        {agents.map((agent, idx) => (
                                            <div key={idx} className={styles.agentBlock}>
                                                <div className={styles.agentRow}>
                                                    <div className={styles.agentSectionLabel}>Agent {idx + 1}</div>
                                                    <div className={styles.modelSelectWrap}>
                                                        {models.length > 0 ? (
                                                            <>
                                                                <button className={styles.modelSelectButton} onMouseDown={e => e.preventDefault()} onClick={e => openMenu(e, `${name}:${idx}`)}>
                                                                    {models.find(m => m.slug_name === agent.model)?.display_name || "Select model"}
                                                                    <BsChevronDown size={12} />
                                                                </button>
                                                                {openModelKey === `${name}:${idx}` && menuPos && createPortal(
                                                                    <div ref={menuRef} className={styles.modelMenu} style={{ top: menuPos.top, bottom: menuPos.bottom, left: menuPos.left }} onMouseDown={e => { e.stopPropagation(); e.preventDefault(); }} onClick={e => e.stopPropagation()}>
                                                                        {models.map(m => (
                                                                            <div key={m.slug_name} className={`${styles.dropdownOption} ${agent.model === m.slug_name ? styles.selectedOption : ""}`} onClick={() => { setModel(name, idx, m.slug_name); setOpenModelKey(null); }}>
                                                                                <div className={`${styles.checkbox} ${agent.model === m.slug_name ? styles.checked : ""}`}>{agent.model === m.slug_name && <BsCheck size={12} />}</div>
                                                                                {m.display_name}
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
