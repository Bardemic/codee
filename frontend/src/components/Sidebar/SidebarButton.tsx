import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import styles from './Sidebar.module.css';

interface ButtonProps {
    text: string;
    icon?: ReactNode;
    to?: string;
    onClick?: () => void;
}

export default function SidebarButton({ text, icon, to, onClick }: ButtonProps) {
    if (to) {
        return (
            <NavLink to={to} className={({ isActive }) => `${styles.navButton} ${isActive ? styles.navButtonActive : ''}`} aria-label={text}>
                {icon}
                <span>{text}</span>
            </NavLink>
        );
    }

    return (
        <button type="button" className={styles.navButton} onClick={onClick} aria-label={text}>
            {icon}
            <span>{text}</span>
        </button>
    );
}
