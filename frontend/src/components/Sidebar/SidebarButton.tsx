import styles from './Sidebar.module.css';

interface ButtonProps {
    text: string;
    onClick?: () => void;
}

export default function SidebarButton(props: ButtonProps) {
    return (
        <div className={styles.Button} onClick={props.onClick}>
            {props.text}
        </div>
    );
}
