import { RepositoriesPill, SelectionPill } from '../../features/repositories/RepositoriesPill';
import { Link, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../lib/useAuth';
import type { Repository, MessageImage } from '../../lib/types';
import styles from './home.module.css';
import { ChatBox } from './components/ChatBox';
import type { CloudAgentsSelection } from './components/CloudAgentsDropdown';
import { FiGitBranch } from 'react-icons/fi';

function Home() {
    const [selectedRepo, setSelectedRepo] = useState<Repository | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [selectedEnvironmentId, setSelectedEnvironmentId] = useState<number | null>(null);
    const [subAgents, setSubAgents] = useState<boolean>(false);
    const [cloudAgents, setCloudAgents] = useState<CloudAgentsSelection>({
        providers: [{ agents: [{ model: 'auto.5', tools: [] }], name: 'Codee' }],
    });

    const selectRepository = (repo: Repository) => {
        setSelectedRepo(repo);
        setSelectedBranch(repo.default_branch);
        setSelectedEnvironmentId(null); // Reset environment when repo changes
    };

    const navigate = useNavigate();
    const utils = trpc.useUtils();

    const { data: branches } = trpc.integrations.branches.useQuery(
        { repository_full_name: selectedRepo?.name ?? '' },
        { enabled: !!selectedRepo, trpc: { context: { skipBatch: true } } }
    );

    const { data: environments } = trpc.environments.listByRepository.useQuery(
        { github_repository_name: selectedRepo?.name ?? '' },
        { enabled: !!selectedRepo }
    );

    const createWorkspace = trpc.workspace.create.useMutation({
        onSuccess: async (result) => {
            await utils.workspace.list.invalidate();
            if (result.agent_id) {
                navigate(`/agent/${result.agent_id}`);
            }
        },
    });
    const { user, loading } = useAuth();
    const { data: integrations } = trpc.integrations.list.useQuery();
    const { data: workspaces } = trpc.workspace.list.useQuery();

    const activeProviders = useMemo(
        () =>
            cloudAgents.providers
                .filter((provider) => provider.agents.length > 0)
                .map((provider) => ({
                    name: provider.name,
                    agents: provider.agents.map((agent) => ({ model: agent.model })),
                })),
        [cloudAgents]
    );

    const branchOptions = useMemo(() => {
        const branchNames = branches?.map((branch) => branch.name) ?? [];
        const defaultBranch = selectedRepo?.default_branch;

        if (defaultBranch && !branchNames.includes(defaultBranch)) {
            branchNames.unshift(defaultBranch);
        }

        return branchNames.map((name) => ({ id: name, label: name, value: name }));
    }, [branches, selectedRepo?.default_branch]);

    const selectedBranchOption = useMemo(() => {
        if (!selectedBranch) return null;
        return (
            branchOptions.find((option) => option.value === selectedBranch) ?? {
                id: selectedBranch,
                label: selectedBranch,
                value: selectedBranch,
            }
        );
    }, [branchOptions, selectedBranch]);

    async function createNewWorkspace(userMessage: string, selectedTools: string[], images: MessageImage[], environmentId: number | null) {
        if (!selectedRepo || !selectedBranch) return;
        await createWorkspace.mutateAsync({
            message: userMessage,
            repository_full_name: selectedRepo.name,
            branch_name: selectedBranch,
            tool_slugs: selectedTools,
            cloud_providers: activeProviders,
            sub_agents: subAgents,
            images,
            environment_id: environmentId ?? undefined,
        });
    }

    useEffect(() => {
        if (!loading && !user) {
            navigate('/login');
        }
    }, [loading, user, navigate]);

    const recentWorkspaces = useMemo(
        () =>
            (workspaces ?? [])
                .filter((workspace) => workspace.agents.length > 0)
                .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                .slice(0, 3),
        [workspaces]
    );

    return (
        <div className={styles.homeContainer}>
            <div className={styles.contentWrap}>
                <h1 className={styles.header}>New Task</h1>
                <div className={styles.chatContainer}>
                    <ChatBox
                        integrations={integrations ?? []}
                        cloudAgents={cloudAgents}
                        onCloudAgentsChange={setCloudAgents}
                        onSubmit={createNewWorkspace}
                        isLoading={createWorkspace.isPending}
                        isDisabled={!selectedBranch}
                        placeholder="Describe your coding task..."
                        subAgents={subAgents}
                        onSubAgentsChange={setSubAgents}
                        environments={environments ?? []}
                        selectedEnvironmentId={selectedEnvironmentId}
                        onEnvironmentChange={setSelectedEnvironmentId}
                        leftPills={
                            <>
                                <RepositoriesPill selected={selectedRepo} setSelected={selectRepository} />
                                <SelectionPill
                                    options={branchOptions}
                                    selected={selectedBranchOption}
                                    onSelect={(option) => setSelectedBranch(option.value)}
                                    placeholder="Select branch"
                                    icon={<FiGitBranch size={14} />}
                                />
                            </>
                        }
                    />
                </div>
                <div className={styles.activitySection}>
                    <h2 className={styles.sectionTitle}>Recent Activity</h2>
                    <div className={styles.activityList}>
                        {recentWorkspaces.map((workspace) => (
                            <Link key={workspace.id} to={`/agent/${workspace.agents[0].id}`} className={`${styles.activityRow} ${styles.activityLink}`}>
                                <div className={styles.activityInfo}>
                                    <span className={styles.activityTitle}>{workspace.name}</span>
                                </div>
                                <span className={styles.activityTime}>View workspace</span>
                            </Link>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default Home;
