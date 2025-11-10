import type { ReactNode } from 'react';
import styles from './Sidebar.module.css'
import SidebarButton from './SidebarButton';

type SidebarProps = {
    children?: ReactNode;
}

export default function Sidebar({ children }: SidebarProps) {
    return (
        <div>
            {children}
            <div className={styles.sidebar}>
                <SidebarButton text="Home" />
            </div>
        </div>
    )
}