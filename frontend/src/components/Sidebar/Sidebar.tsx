import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';
import SidebarButton from './SidebarButton';
import { signOut } from '../../lib/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { trpc } from '../../lib/trpc';

type SidebarProps = {
    children?: ReactNode;
};

export default function Sidebar({ children }: SidebarProps) {
    const navigate = useNavigate();
    const location = useLocation();
    const { data: workspaces } = trpc.workspace.list.useQuery();

    async function handleSignOut() {
        await signOut();
        navigate('/login');
    }

    // Determine active agent id from the current path, e.g. /agent/123
    const match = location.pathname.match(/\/agent\/(\d+)/);
    const activeAgentId = match ? Number(match[1]) : null;

    return (
        <div className={styles.container}>
            <nav className={styles.sidebar}>
                <h2 className={styles.header}>codee</h2>
                <div className={styles.navigationSection}>
                    <SidebarButton text="Home" onClick={() => navigate('/')} />
                    <SidebarButton text="Integrations" onClick={() => navigate('/integrations')} />
                    <SidebarButton text="Workers" onClick={() => navigate('/workers')} />
                </div>
                <h3>Workspaces</h3>
                <div className={styles.workspaces}>
                    {workspaces?.map((workspace) => {
                        if (!workspace || workspace.agents.length === 0) return null;
                        const isActive = activeAgentId != null && workspace.agents.some((a) => a.id === activeAgentId);
                        return (
                            <div
                                key={workspace.id}
                                className={`${styles.button} ${isActive ? styles.active : ''}`}
                                onClick={() => navigate(`agent/${workspace.agents[0].id}`)}
                            >
                                {workspace.name}
                            </div>
                        );
                    })}
                </div>
                <div className={styles.profileSection}>
                    <SidebarButton text="Logout" onClick={handleSignOut} />
                </div>
            </nav>
            <main className={styles.content}>{children}</main>
        </div>
    );
}
