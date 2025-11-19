import type { ReactNode } from 'react';
import styles from './Sidebar.module.css'
import SidebarButton from './SidebarButton';
import { useUserSignoutMutation } from '../../app/services/auth/authService';
import { useNavigate } from 'react-router-dom';
import { useGetWorkspacesQuery } from '../../app/services/workspaces/workspacesService';

type SidebarProps = {
    children?: ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    const [userSignout] = useUserSignoutMutation();
    const navigate = useNavigate();
    const { data: workspaces } = useGetWorkspacesQuery();


    return (
        <div className={styles.container}>
            <nav className={styles.sidebar}>
                <h2 className={styles.header}>codee</h2>
                <div className={styles.navigationSection}>
                    <SidebarButton text="Home" onClick={() => navigate('/')}/>
                    <SidebarButton text="Integrations" onClick={() => navigate('/integrations')}/>
                </div>
                <div className={styles.workspacesSection}>
                    <h3>Workspaces</h3>
                    <div className={styles.workspaces}>
                        {workspaces?.map((workspace) => (
                            <div key={workspace.id} className={styles.button} onClick={() => navigate(`workspace/${workspace.id}`)}>
                                {workspace.name}
                            </div>
                        ))}
                    </div>
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