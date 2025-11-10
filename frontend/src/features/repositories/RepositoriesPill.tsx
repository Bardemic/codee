import { useEffect, useRef, useState } from "react";
import { useGetRepositoriesQuery, type Repository } from "../../app/services/repositories/repositoriesService";
import styles from './repositoriesPill.module.css'

export const RepositoriesPill = () => {
    const { data: repos } = useGetRepositoriesQuery();
    const [selected, setSelected] = useState<Repository | null>(null)
    const [dropDown, setDropDown] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        if (!repos || repos.length === 0) return
        setSelected(repos[0])
    }, [repos])
    useEffect(() => {
        const onDocumentClick = (event: MouseEvent) => {
            if (!containerRef.current) return
            if (!containerRef.current.contains(event.target as Node)) {
                setDropDown(false)
            }
        }
        document.addEventListener('mousedown', onDocumentClick)
        return () => {
            document.removeEventListener('mousedown', onDocumentClick)
        }
    }, [])
    return (
        <div
            ref={containerRef}
            onClick={() => setDropDown(!dropDown)}
            className={styles.pillContainer}
            role="button"
            aria-haspopup="listbox"
            aria-expanded={dropDown}
        >
            {selected ? selected.name : 'Select repository'}
            {dropDown && repos && repos.length > 0 && (
                <div className={styles.dropdownContainer} role="listbox">
                    {repos
                        .filter(repo => repo.id !== selected?.id)
                        .map(repo => (
                            <div key={repo.id}
                                onClick={(e) => {
                                    e.stopPropagation()
                                    setSelected(repo)
                                    setDropDown(false)
                                }}
                                className={styles.dropdownOption}
                                role="option"
                                aria-selected={false}>
                                {repo.name}
                            </div>
                        ))}
                </div>
            )}
        </div>
    );
}