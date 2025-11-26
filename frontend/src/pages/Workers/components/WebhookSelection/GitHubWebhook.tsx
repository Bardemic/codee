import { useState } from 'react';
import styles from './styles.module.css';
import { BsCheck } from 'react-icons/bs';

export function GitHubWebhook() {
    const [selected, setSelected] = useState<string | null>(null);

    const toggle = (option: string) => {
        setSelected(prev => prev === option ? null : option);
    };

    return (
        <div className={styles.container}>
            <p className={styles.text}>
                Select the events you want to subscribe to. These webhooks will trigger whenever the selected actions occur in your repository.
            </p>
            {['Comment', 'Issue'].map(option => (
                <div key={option} className={styles.checkboxOption} onClick={() => toggle(option)}>
                    <div className={`${styles.checkbox} ${selected === option && styles.checked}`}>
                         {selected === option && <BsCheck size={14} />}
                    </div>
                    {option}
                </div>
            ))}
        </div>
    );
}

