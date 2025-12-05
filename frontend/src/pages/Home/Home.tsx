import { useGetUserInfoQuery } from '../../app/services/auth/authService';
import { RepositoriesPill } from '../../features/repositories/RepositoriesPill';
import { useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { useGetIntegrationsQuery, type Repository } from "../../app/services/integrations/integrationsService";
import { useNewWorkspaceMutation } from '../../app/services/workspaces/workspacesService';
import styles from './home.module.css';
import { ChatBox } from './components/ChatBox';
import type { CloudAgentsSelection } from './components/CloudAgentsDropdown';

function Home() {
    const [selected, setSelected] = useState<Repository | null>(null);
    const [cloudAgents, setCloudAgents] = useState<CloudAgentsSelection>({ providers: [{agents: [{model: "auto.5", tools: []}], name: "Codee"}] });
    const navigate = useNavigate();
    const [newWorkspace, { isLoading: isCreatingWorkspace }] = useNewWorkspaceMutation();
    const { data: user, isLoading } = useGetUserInfoQuery();
    const { data: integrations } = useGetIntegrationsQuery();

    const activeProviders = useMemo(() => {
        return cloudAgents.providers
            .filter(p => (p.agents?.length ?? 0) > 0)
            .map(p => ({
                name: p.name,
                agents: p.agents.map(a => ({ model: a.model }))
            }));
    }, [cloudAgents]);

    async function createNewWorkspace(userMessage: string, selectedTools: string[]) {
        const r = await newWorkspace({message: userMessage, repository_name: selected?.name || "", tool_slugs: selectedTools, cloud_providers: activeProviders}).unwrap();
        if (r.agent_id) navigate(`/agent/${r.agent_id}`);
    }

    useEffect(() => {
        if (!isLoading && !user) {
            navigate("/login");
        }
    }, [isLoading, user, navigate]);
    return (
        <div className={styles.homeContainer}>
            <h1 className={styles.header}>say hi to <span className={styles.focusedHeader}>Codee</span>.</h1>
        <div className={styles.chatContainer}>
            <ChatBox
                integrations={integrations ?? []}
                cloudAgents={cloudAgents}
                onCloudAgentsChange={setCloudAgents}
                onSubmit={createNewWorkspace}
                isLoading={isCreatingWorkspace}
                placeholder='Find all errors from the recent commit and fix them'
                leftPills={<RepositoriesPill selected={selected} setSelected={setSelected} />}
            />
        </div>
        </div>
    )
}

export default Home
