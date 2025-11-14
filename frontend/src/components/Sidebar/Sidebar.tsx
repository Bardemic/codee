import type { ReactNode } from 'react';
import styles from './Sidebar.module.css'
import SidebarButton from './SidebarButton';
import { useUserSignoutMutation } from '../../app/services/auth/authService';
import { useNavigate } from 'react-router-dom';

type SidebarProps = {
    children?: ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    const [userSignout] = useUserSignoutMutation();
    const navigate = useNavigate();

    return (
        <div className={styles.container}>
            <nav className={styles.sidebar}>
                <SidebarButton text="Home" onClick={() => navigate('/')}/>
                <SidebarButton text="Integrations" onClick={() => navigate('/integrations')}/>
                <SidebarButton text="Logout" onClick={() => userSignout()}/>
            </nav>
            <main className={styles.content}>
                {children}
            </main>
        </div>
    )
}