import { useEffect, useState } from "react";
import { useGetRepositoriesQuery, type Repository } from "../../app/services/repositories/repositoriesService";
import styles from './repositoriesPill.module.css'

export const RepositoriesPill = () => {
    const { data: repos } = useGetRepositoriesQuery();
    const [selected, setSelected] = useState<Repository | null>(null)
    const [dropDown, setDropDown] = useState(false)

    useEffect(() => {
        if (!repos || repos.length === 0) return
        setSelected(repos[0])
    }, [repos])
    return (
        <div onClick={() => setDropDown(!dropDown)} className={styles.pillContainer}>
            {selected && selected.name}
            {dropDown && repos?.map(repo => (
                repo.id !== selected?.id && (
                    <div key={repo.id}>
                        {repo.name}
                    </div>
                )
            ))}
        </div>
    );
}