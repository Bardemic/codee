import { useEffect, useState } from "react";
import { useAppSelector, useAppDispatch } from "../../app/hooks";
import { fetchRepositories, selectAllRepositories, selectRepositoriesStatus } from "./repositoriesSlice";
import styles from './repositoriesPill.module.css'

export const RepositoriesPill = () => {
    const dispatch = useAppDispatch();
    const repos = useAppSelector(selectAllRepositories)
    const repoStatus = useAppSelector(selectRepositoriesStatus)
    const [selected, setSelected] = useState(repos[0])
    const [dropDown, setDropDown] = useState(false)

    useEffect(() => {
        if(repoStatus === 'idle') {
            dispatch(fetchRepositories())
        }
        setSelected(repos[0])
    }, [repoStatus, dispatch, repos])
    return (
        <div onClick={() => setDropDown(!dropDown)} className={styles.pillContainer}>
            {selected && selected.name}
            {dropDown && (
                <div className={styles.dropdownContainer}>
                    {repos.length > 0 && repos.map((repo) => repo.id != selected.id && (
                        <div key={repo.id}>
                            {repo.name}
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}