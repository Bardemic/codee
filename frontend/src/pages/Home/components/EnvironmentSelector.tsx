import { useState, useRef, useEffect } from 'react';
import { FiLock, FiChevronDown } from 'react-icons/fi';
import type { EnvironmentForRepo } from '../../../lib/types';
import styles from '../home.module.css';

interface EnvironmentSelectorProps {
    environments: EnvironmentForRepo[];
    selectedId: number | null;
    onChange: (id: number | null) => void;
}

export function EnvironmentSelector({ environments, selectedId, onChange }: EnvironmentSelectorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const selectedEnv = environments.find((env) => env.id === selectedId);
    const label = selectedEnv ? selectedEnv.name : 'No Environment';

    return (
        <div ref={containerRef} className={styles.pillContainer} onClick={() => setIsOpen(!isOpen)}>
            <FiLock size={14} />
            <span>{label}</span>
            <FiChevronDown size={12} style={{ marginLeft: 'auto' }} />
            {isOpen && (
                <div className={styles.dropdownContainer} onClick={(e) => e.stopPropagation()}>
                    <div
                        className={`${styles.dropdownOption} ${selectedId === null ? styles.selectedOption : ''}`}
                        onClick={() => {
                            onChange(null);
                            setIsOpen(false);
                        }}
                    >
                        No Environment
                    </div>
                    {environments.map((env) => (
                        <div
                            key={env.id}
                            className={`${styles.dropdownOption} ${selectedId === env.id ? styles.selectedOption : ''}`}
                            onClick={() => {
                                onChange(env.id);
                                setIsOpen(false);
                            }}
                        >
                            <span>{env.name}</span>
                            <span style={{ fontSize: '11px', color: 'var(--color-muted)', marginLeft: 'auto' }}>
                                {env.files_count} file{env.files_count !== 1 ? 's' : ''}
                            </span>
                        </div>
                    ))}
                    {environments.length === 0 && (
                        <div className={styles.emptyState}>
                            No environments for this repository
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
