import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';
import SidebarButton from './SidebarButton';
import { useAuth } from '../../lib/useAuth';
import { NavLink, useNavigate } from 'react-router-dom';
import { trpc } from '../../lib/trpc';
import { FiHome, FiGrid, FiUsers, FiLogOut, FiSettings } from 'react-icons/fi';
import codeeLogo from '../../assets/svgs/CodeeLogo.svg';

type SidebarProps = {
    children?: ReactNode;
};

export default function Sidebar({ children }: SidebarProps) {
    const navigate = useNavigate();
    const { refresh } = useAuth();
    const { data: workspaces } = trpc.workspace.list.useQuery();

    function handleSignOut() {
        window.location.href = 'http://localhost:5001/api/auth/logout';
    }

    return (
        <div className={styles.container}>
            <nav className={styles.sidebar}>
                <div className={styles.brand}>
                    <img src={codeeLogo} alt="codee" className={styles.brandIcon} />
                    <h2 className={styles.header}>codee</h2>
                </div>
                <div className={styles.navigationSection}>
                    <SidebarButton text="Home" to="/" icon={<FiHome size={16} />} />
                    <SidebarButton text="Integrations" to="/integrations" icon={<FiGrid size={16} />} />
                    <SidebarButton text="Workers" to="/workers" icon={<FiUsers size={16} />} />
                </div>
                <h3 className={styles.sectionHeading}>Workspaces</h3>
                <div className={styles.workspaces}>
                    {workspaces?.map(
                        (workspace) =>
                            workspace.agents.length > 0 && (
                                <NavLink
                                    key={workspace.id}
                                    to={`/agent/${workspace.agents[0].id}`}
                                    className={({ isActive }) => `${styles.workspaceButton} ${isActive ? styles.workspaceButtonActive : ''}`}
                                >
                                    {workspace.name}
                                </NavLink>
                            )
                    )}
                </div>
                <div className={styles.profileSection}>
                    <SidebarButton text="Settings" to="/settings" icon={<FiSettings size={16} />} />
                    <SidebarButton text="Logout" onClick={handleSignOut} icon={<FiLogOut size={16} />} />
                </div>
            </nav>
            <main className={styles.content}>{children}</main>
        </div>
    );
}
