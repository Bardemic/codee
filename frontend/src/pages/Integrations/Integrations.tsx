import styles from './integrations.module.css';
import { useNavigate, useSearchParams } from "react-router-dom";
import { useEffect } from "react";
import { useAddIntegrationMutation, useDeleteIntegrationMutation, useGetIntegrationsQuery, type Integration } from "../../app/services/integrations/integrationsService";
import IntegrationCard from "./IntegrationCard";

export default function Integrations() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [addIntegration] = useAddIntegrationMutation();
    const [deleteIntegration] = useDeleteIntegrationMutation();
    const { data: integrations } = useGetIntegrationsQuery();

    useEffect(() => {
        const callback = searchParams.get('callback');
        if (!callback) return;

        const stateKey = searchParams.get("state");
        const localKey = sessionStorage.getItem("curKey");
        if (!stateKey || stateKey !== localKey) return;

        const installationId = searchParams.get("installation_id");
        if (!installationId) return;

        addIntegration({
            type: "github",
            data: { installation_id: installationId }
        })
        .unwrap()
        .then(() => {
            sessionStorage.removeItem("curKey");
            navigate("/integrations/");
        })
        .catch(() => {sessionStorage.removeItem("curKey");});
    }, [searchParams, addIntegration, navigate])

    function handleConnect(integration: Integration, data?: { api_key: string }) {
        const slug = integration.name.toLowerCase().replace(/\s+/g, '-');

        if (slug === 'github') {
            const key = Math.random().toString();
            sessionStorage.setItem("curKey", key);
            window.open(`https://github.com/apps/codee-local/installations/new?state=${key}&redirect_url=http://localhost:5173/integrations?callback=github`, '_blank');
            navigate("/integrations");
            return;
        }
        if (data?.api_key) {
            addIntegration({
                type: integration.id.toString(),
                data: { api_key: data.api_key },
            })
        }
    }

    return (
        <div className={styles.integrationsPage}>
            <h1>
                Integrations
            </h1>
            <div className={styles.integrationsContainer}>
                {integrations?.map((integration) => integration.name != "Codee" && (
                        <IntegrationCard 
                            key={integration.id} 
                            integration={integration} 
                            onConnect={(data) => handleConnect(integration, data)} 
                            onDelete={deleteIntegration}  
                        />
                ))}
            </div>
        </div>
    )
}
