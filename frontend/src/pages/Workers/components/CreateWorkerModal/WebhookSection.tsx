import { useState } from "react";
import { BsChevronDown } from "react-icons/bs";
import githubIcon from "../../../../assets/svgs/github.svg";
import posthogIcon from "../../../../assets/svgs/posthog.svg";
import { WebhookSelection } from "../WebhookSelection/index";
import styles from "./styles.module.css";

interface WebhookSectionProps {
    slug: string;
    selectedIntegration: string;
    setSelectedIntegration: (integration: string) => void;
}

export function WebhookSection({ slug, selectedIntegration, setSelectedIntegration }: WebhookSectionProps) {
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);

    return (
        <div className={styles.webhookEditor}>
            <div className={styles.toolsHeader}>Webhook Editor</div>
            <div className={styles.dropdownWrapper}>
                <div className={styles.dropdownToggle} onClick={() => setIsDropdownOpen(!isDropdownOpen)}>
                    <img 
                        src={selectedIntegration === 'GitHub' ? githubIcon : posthogIcon} 
                        alt={selectedIntegration}
                        className={styles.providerIcon}
                    />
                    <span style={{ flex: 1 }}>{selectedIntegration}</span>
                    <BsChevronDown />
                </div>
                
                {isDropdownOpen && (
                    <div className={styles.dropdownMenu}>
                        {['GitHub', 'PostHog'].map(provider => (
                            <div 
                                key={provider}
                                onClick={() => {
                                    setSelectedIntegration(provider);
                                    setIsDropdownOpen(false);
                                }}
                                className={`${styles.dropdownItem} ${selectedIntegration === provider ? styles.dropdownItemSelected : ''}`}
                            >
                                <img 
                                    src={provider === 'GitHub' ? githubIcon : posthogIcon} 
                                    alt={provider}
                                    className={styles.providerIcon}
                                />
                                {provider}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            <WebhookSelection integration={selectedIntegration} slug={slug} />
        </div>
    );
}

