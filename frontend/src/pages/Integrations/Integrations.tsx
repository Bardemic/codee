import styles from './integrations.module.css';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useEffect } from 'react';
import { trpc } from '../../lib/trpc';
import type { Integration } from '../../lib/types';
import IntegrationCard from './IntegrationCard';

export default function Integrations() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const utils = trpc.useUtils();
    const addIntegration = trpc.integrations.connect.useMutation({
        onSuccess: () => {
            utils.integrations.list.invalidate();
            utils.integrations.repositories.invalidate();
        },
    });
    const deleteIntegration = trpc.integrations.disconnect.useMutation({
        onSuccess: () => {
            utils.integrations.list.invalidate();
            utils.integrations.repositories.invalidate();
        },
    });
    const { data: integrations } = trpc.integrations.list.useQuery();

    useEffect(() => {
        const callback = searchParams.get('callback');
        if (!callback) return;

        const stateKey = searchParams.get('state');
        const localKey = sessionStorage.getItem('curKey');
        if (!stateKey || stateKey !== localKey) return;

        const installationId = searchParams.get('installation_id');
        if (!installationId) return;

        addIntegration.mutate(
            {
                providerSlug: 'github_app',
                data: { installation_id: installationId },
            },
            {
                onSuccess: () => {
                    sessionStorage.removeItem('curKey');
                    navigate('/integrations/');
                },
                onError: () => {
                    sessionStorage.removeItem('curKey');
                },
            }
        );
    }, [searchParams, addIntegration, navigate]);

    function handleConnect(integration: Integration, data?: { api_key: string }) {
        const slug = (integration.slug ?? integration.name).toLowerCase().replace(/\s+/g, '-').replace(/_/g, '-');

        if (slug.includes('github')) {
            const key = Math.random().toString();
            sessionStorage.setItem('curKey', key);
            window.open(
                `https://github.com/apps/codee-local/installations/new?state=${key}&redirect_url=http://localhost:5173/integrations?callback=github`,
                '_blank'
            );
            navigate('/integrations');
            return;
        }
        if (data?.api_key) {
            addIntegration.mutate({
                providerId: integration.id,
                data: { api_key: data.api_key },
            });
        }
    }

    function handleDelete(connectionId: number) {
        deleteIntegration.mutate({ connectionId });
    }

    return (
        <div className={styles.integrationsPage}>
            <h1>Integrations</h1>
            <div className={styles.integrationsContainer}>
                {integrations?.map(
                    (integration) =>
                        integration.name !== 'Codee' && (
                            <IntegrationCard
                                key={integration.id}
                                integration={integration}
                                onConnect={(data) => handleConnect(integration, data)}
                                onDelete={handleDelete}
                            />
                        )
                )}
            </div>
        </div>
    );
}
