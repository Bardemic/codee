import { useEffect, useMemo, useRef, useState } from "react";
import { GoRepo } from "react-icons/go";
import { useGetRepositoriesQuery, type Repository } from "../../app/services/integrations/integrationsService";
import styles from './styles.module.css';

interface Props {
    selected: Repository | null;
    setSelected: (repo: Repository | null) => void;
    direction?: 'up' | 'down';
}

export function RepositoriesPill({ selected, setSelected, direction = 'down' }: Props) {
    const { data: repos } = useGetRepositoriesQuery();
    const [dropDown, setDropDown] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!repos || repos.length === 0) return;
        if (selected === null) {
            setSelected(repos[0]);
        }
    }, [repos, selected, setSelected]);

    useEffect(() => {
        const onDocumentClick = (event: MouseEvent) => {
            if (!containerRef.current) return;
            if (!containerRef.current.contains(event.target as Node)) {
                setDropDown(false);
            }
        };
        document.addEventListener('mousedown', onDocumentClick);
        return () => {
            document.removeEventListener('mousedown', onDocumentClick);
        };
    }, []);

    useEffect(() => {
        if (!dropDown) {
            setSearchTerm('');
        }
    }, [dropDown]);

    const filteredRepos = useMemo(() => {
        if (!repos) return [];
        const sanitized = searchTerm.trim().toLowerCase();
        return repos
            .filter(repo => repo.github_id !== selected?.github_id)
            .filter(repo => repo.name.toLowerCase().includes(sanitized));
    }, [repos, searchTerm, selected]);

    return (
        <div
            ref={containerRef}
            onClick={() => setDropDown(!dropDown)}
            className={styles.container}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={dropDown}
        >
            <GoRepo size={14} />
            {selected ? selected.name : 'Select repository'}
            {dropDown && repos && repos.length > 0 && (
                <div
                    className={`${styles.dropdown} ${direction === 'up' ? styles.up : styles.down}`}
                    role="listbox"
                    onClick={(e) => e.stopPropagation()}
                >
                    <input
                        className={styles.searchInput}
                        placeholder="Search repositories"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                    />
                    {filteredRepos.length > 0 ? (
                        filteredRepos.map(repo => (
                            <div key={repo.github_id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(repo);
                                    setDropDown(false);
                                }}
                                className={styles.option}
                                role="option"
                                aria-selected={false}>
                                {repo.name}
                            </div>
                        ))
                    ) : (
                        <div className={styles.emptyState}>No repositories found</div>
                    )}
                </div>
            )}
        </div>
    );
}

