import { useState } from 'react';
import { FaCopy } from 'react-icons/fa';
import styles from './styles.module.css';
import { RepositoriesPill } from '../../../../features/repositories/RepositoriesPill';
import type { Repository } from '../../../../lib/types';

interface Props {
    slug: string;
}

export function PostHogWebhook({ slug }: Props) {
    const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
    const jsonSnippet = JSON.stringify(
        {
            worker_slug: slug,
            event: '{event.properties}',
            repository: selectedRepo?.name || 'name/repository',
            key: 'testing',
        },
        null,
        2
    );

    const handleCopy = () => {
        navigator.clipboard.writeText(jsonSnippet);
    };

    return (
        <div className={styles.container}>
            <p className={styles.text}>
                Integrate your worker with PostHog to automatically trigger actions based on events. This setup ensures seamless data flow between your
                analytics and worker processes. Simply copy the configuration below to get started immediately.
            </p>
            <div className={styles.codeBlock}>
                <pre>{jsonSnippet}</pre>
                <button className={styles.copyButton} onClick={handleCopy} aria-label="Copy to clipboard" title="Copy to clipboard">
                    <FaCopy size={16} />
                </button>
            </div>

            <p className={styles.text}>Replace the json with the name of the repository, or select one from here</p>

            <RepositoriesPill selected={selectedRepo} setSelected={setSelectedRepo} direction="up" />
        </div>
    );
}
