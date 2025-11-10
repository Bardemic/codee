import type { ReactNode } from 'react';
import styles from './Sidebar.module.css'
import SidebarButton from './SidebarButton';
import { useUserSignoutMutation } from '../../app/services/auth/authService';

type SidebarProps = {
    children?: ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    const [userSignout] = useUserSignoutMutation();

    return (
        <div>
            {children}
            <div className={styles.sidebar}>
                <SidebarButton text="Home" onClick={() => {}}/>
                <SidebarButton text="Logout" onClick={() => userSignout()}/>
            </div>
        </div>
    )
}