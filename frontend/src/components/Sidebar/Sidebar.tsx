import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import styles from './Sidebar.module.css'
import SidebarButton from './SidebarButton';
import { useUserSignoutMutation } from '../../app/services/auth/authService';
import { useNavigate } from 'react-router-dom';
import { useGetWorkspacesQuery } from '../../app/services/workspaces/workspacesService';
import type { Workspace } from '../../app/services/workspaces/workspacesService';

 type SidebarProps = {
    children?: ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    const [userSignout] = useUserSignoutMutation();
    const navigate = useNavigate();

    const [page, setPage] = useState(1);
    const pageSize = 20;

    const { data, isFetching, isLoading } = useGetWorkspacesQuery({ page, page_size: pageSize });

    const [items, setItems] = useState<Workspace[]>([]);

    useEffect(() => {
        if (!data) return;
        setItems(prev => {
            const next = page === 1 ? data.results : [...prev, ...data.results];
            // de-dupe by id in case of refetch
            const seen = new Set<number | string>();
            const unique: Workspace[] = [];
            for (const ws of next) {
                const id = ws.id as number | string;
                if (!seen.has(id)) {
                    unique.push(ws);
                    seen.add(id);
                }
            }
            return unique;
        });
    }, [data, page]);

    const hasMore = useMemo(() => !!data?.next_page, [data]);

    return (
        <div className={styles.container}>
            <nav className={styles.sidebar}>
                <h2 className={styles.header}>codee</h2>
                <div className={styles.navigationSection}>
                    <SidebarButton text="Home" onClick={() => navigate('/')}/>
                    <SidebarButton text="Integrations" onClick={() => navigate('/integrations')}/>
                </div>
                <h3>Workspaces</h3>
                <div className={styles.workspaces}>
                    {items.map((workspace: Workspace) => (
                        <div key={workspace.id} className={styles.button} onClick={() => navigate(`workspace/${workspace.id}`)}>
                            {workspace.name}
                        </div>
                    ))}
                    {(isLoading || isFetching) && <div>Loading…</div>}
                    {hasMore && !isFetching && (
                        <div className={styles.button} onClick={() => setPage(p => p + 1)}>
                            Load more
                        </div>
                    )}
                </div>
                <div className={styles.profileSection}>
                    <SidebarButton text="Logout" onClick={() => userSignout()}/>
                </div>
            </nav>
            <main className={styles.content}>
                {children}
            </main>
        </div>
    )
}