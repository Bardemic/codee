import { useState } from 'react';
import type { Integration } from '../../lib/types';
import styles from './integrations.module.css';

interface IntegrationCardProps {
    integration: Integration;
    onDelete: (id: number) => void;
    onConnect: (data?: { api_key: string }) => void;
}

export default function IntegrationCard(props: IntegrationCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [apiKey, setApiKey] = useState('');

    const normalizedSlug = (props.integration.slug ?? props.integration.name).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');
    const isGithub = normalizedSlug.includes('github');
    const iconKey = isGithub ? 'github' : normalizedSlug;
    const iconSrc = `/assets/svgs/${iconKey}.svg`;
    const isAPIkey = !isGithub;

    function handleConnectClick() {
        if (isAPIkey) {
            setIsExpanded(true);
        } else {
            props.onConnect();
        }
    }

    function handleSubmit() {
        if (!apiKey.trim()) return;
        props.onConnect({ api_key: apiKey.trim() });
        setIsExpanded(false);
        setApiKey('');
    }

    function handleCancel() {
        setIsExpanded(false);
        setApiKey('');
    }

    return (
        <div className={styles.integration}>
            <div className={styles.integrationHeader}>
                <div className={styles.iconContainer}>
                    <img className={styles.icon} src={iconSrc} alt={props.integration.name} />
                    {props.integration.name}
                </div>
                {props.integration.connection_id ? (
                    <div className={styles.connected}>
                        <button
                            onClick={() => {
                                props.onDelete(props.integration.connection_id!);
                            }}
                        >
                            Delete connection
                        </button>
                        <button disabled>Connected</button>
                    </div>
                ) : (
                    !isExpanded && <button onClick={handleConnectClick}>Connect</button>
                )}
            </div>

            {isExpanded && (
                <div className={styles.inputContainer}>
                    <input
                        className={styles.apiKeyInput}
                        type="text"
                        placeholder={`Enter API Key for ${props.integration.name}`}
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSubmit();
                            if (e.key === 'Escape') handleCancel();
                        }}
                    />
                    <button className={styles.cancelButton} onClick={handleCancel}>
                        Cancel
                    </button>
                    <button onClick={handleSubmit} disabled={!apiKey.trim()}>
                        Save
                    </button>
                </div>
            )}
        </div>
    );
}
