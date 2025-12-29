import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { GoRepo } from 'react-icons/go';
import { trpc } from '../../lib/trpc';
import type { Repository } from '../../lib/types';
import styles from './styles.module.css';

export type PillOption<T = unknown> = {
    id: string | number;
    label: string;
    value: T;
};

type SelectionPillProps<T> = {
    options: PillOption<T>[];
    selected: PillOption<T> | null;
    onSelect: (option: PillOption<T>) => void;
    direction?: 'up' | 'down';
    placeholder: string;
    icon?: ReactNode;
};

export function SelectionPill<T>({ options, selected, onSelect, direction = 'down', placeholder, icon }: SelectionPillProps<T>) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
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

    useEffect(() => {
        if (!isOpen) setSearchTerm('');
    }, [isOpen]);

    const filteredOptions = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return options.filter((option) => !query || option.label.toLowerCase().includes(query));
    }, [options, searchTerm]);

    return (
        <div
            ref={containerRef}
            onClick={() => setIsOpen(!isOpen)}
            className={styles.container}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={isOpen}
        >
            {icon}
            <span className={styles.label}>{selected?.label ?? placeholder}</span>
            {isOpen && options.length > 0 && (
                <div
                    className={`${styles.dropdown} ${direction === 'up' ? styles.up : styles.down}`}
                    role="listbox"
                    onClick={(event) => event.stopPropagation()}
                >
                    <input
                        className={styles.searchInput}
                        placeholder="Search..."
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        onClick={(event) => event.stopPropagation()}
                    />
                    {filteredOptions.length > 0 ? (
                        filteredOptions.map((option) => (
                            <div
                                key={option.id}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onSelect(option);
                                    setIsOpen(false);
                                }}
                                className={styles.option}
                                role="option"
                                aria-selected={option.id === selected?.id}
                            >
                                {option.label}
                            </div>
                        ))
                    ) : (
                        <div className={styles.emptyState}>No options found</div>
                    )}
                </div>
            )}
        </div>
    );
}

interface RepositoriesPillProps {
    selected: Repository | null;
    setSelected: (repo: Repository) => void;
    direction?: 'up' | 'down';
}

export function RepositoriesPill({ selected, setSelected, direction = 'down' }: RepositoriesPillProps) {
    const { data: repos } = trpc.integrations.repositories.useQuery(undefined, {
        trpc: { context: { skipBatch: true } },
    });

    const repoOptions = useMemo<PillOption<Repository>[]>(
        () => (repos ?? []).map((repo) => ({ id: repo.github_id, label: repo.name, value: repo })),
        [repos]
    );

    const selectedOption = useMemo(
        () => repoOptions.find((option) => option.value.github_id === selected?.github_id) ?? null,
        [repoOptions, selected?.github_id]
    );

    useEffect(() => {
        if (!selected && repoOptions.length > 0) {
            setSelected(repoOptions[0].value);
        }
    }, [repoOptions, selected, setSelected]);

    return (
        <SelectionPill
            options={repoOptions}
            selected={selectedOption}
            onSelect={(option) => setSelected(option.value)}
            direction={direction}
            placeholder="Select repository"
            icon={<GoRepo size={14} />}
        />
    );
}
