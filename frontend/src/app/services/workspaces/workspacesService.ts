import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export interface Agent {
    url: string
    integration: "Cursor" | "Codee" | "Jules"
    id: number
    name: string
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
    github_branch_name: string | null
}

export interface Workspace {
    id: number
    created_at: string
    name: string
    default_branch: string
    github_repository_name: string
    agents: Agent[]
}

export interface NewWorkspaceResponse {
    agent_id: number
}

export interface ToolCall {
    id: number | string
    created_at: string
    tool_name: string
    arguments: Record<string, unknown>
    result: string
    status: string
    duration_ms: number | null
}

export interface Message {
    id: number | string
    created_at: string
    sender: "USER" | "AGENT"
    content: string
    tool_calls: ToolCall[]
    isPendingAgent?: boolean
}

export interface AgentConfig {
    model: string
}

export interface ProviderConfig {
    name: string
    agents: AgentConfig[]
}

export const workspacesApi = createApi({
    reducerPath: 'workspacesApi',
    tagTypes: ['WorkspaceMessages', 'Workspaces', 'Workspace'],
    baseQuery: fetchBaseQuery({
        baseUrl: 'http://127.0.0.1:5001/api/workspace/', prepareHeaders: (headers,) => {
            const token = localStorage.getItem('userToken');
            if (token) headers.set('Authorization', `Token ${token}`);
            return headers;
        },
    }),
    endpoints: (builder) => ({
        newWorkspace: builder.mutation<NewWorkspaceResponse, { message: string, repository_name: string, tool_slugs: string[], cloud_providers: ProviderConfig[]}>({
            query: ({ message, repository_name, tool_slugs, cloud_providers}) => ({
                url: 'new_workspace/',
                method: "POST",
                body: {message, repository_full_name:repository_name, tool_slugs, cloud_providers}
            }),
            invalidatesTags: ['Workspaces']
        }),
        newMessage: builder.mutation<void, {message: string, agent_id: number}>({
            query: ({message, agent_id}) => ({
                url: `${agent_id}/message/`,
                method: "POST",
                body: {message}
            }),
            invalidatesTags: (_, __, arg) => [
                { type: 'Workspaces' },
                { type: 'WorkspaceMessages', id: arg.agent_id }
            ]
        }),
        createBranch: builder.mutation<{branch_name: string}, string>({
            query: (agent_id: string) => ({
                url: `${agent_id}/create-branch/`,
                method: "POST",
            }),
            invalidatesTags: ['Workspaces']
        }),
        getWorkspaces: builder.query<Workspace[], void>({
            query: () => ({
                url: '',
            }),
            providesTags: ['Workspaces']
        }),
        getWorkspaceMessages: builder.query<Message[], string>({
            query: (agent_id: string) => ({
                url: `messages/${agent_id}`,
            }),
            providesTags: (_result, _error, agent_id) => [{ type: 'WorkspaceMessages', id: agent_id }],
            async onCacheEntryAdded(
                agent_id,
                {updateCachedData, cacheDataLoaded, cacheEntryRemoved, dispatch},
            ) {
                try {
                    await cacheDataLoaded

                    const baseStreamUrl = `http://localhost:8000/stream/agent/${agent_id}`;
                    let streamUrl = baseStreamUrl;

                    try {
                        const statusResponse = await fetch(`http://127.0.0.1:5001/api/workspace/${agent_id}/status/`, {
                            headers: {
                                'Authorization': `Token ${localStorage.getItem('userToken')}`
                            }
                        });

                        if (statusResponse.ok) {
                            const statusData = await statusResponse.json();
                            const isActive = statusData.status === 'PENDING' || statusData.status === 'RUNNING';
                            if (!isActive) {
                                streamUrl = `${baseStreamUrl}?last_event_id=%24`;
                            }
                        } else {
                            streamUrl = `${baseStreamUrl}?last_event_id=%24`;
                        }
                    } catch (statusError) {
                        console.warn('Unable to determine agent status for stream start', statusError);
                    }

                    const eventSource = new EventSource(streamUrl);

                    eventSource.addEventListener('status', (event: MessageEvent) => {
                        const data = JSON.parse(event.data)
                        console.log('[status]', data.phase, data.step, data.detail);

                        if (data.step?.startsWith('tool_')) {
                            const statusId = event.lastEventId || `sse_${Date.now()}`;
                            updateCachedData((draft) => {
                                let targetMessage = draft.find((msg) => msg.id === '__pending_agent__');
                                if (!targetMessage) {
                                    targetMessage = {
                                        id: '__pending_agent__',
                                        created_at: new Date().toISOString(),
                                        sender: "AGENT",
                                        content: "",
                                        isPendingAgent: true,
                                        tool_calls: []
                                    };
                                    draft.push(targetMessage);
                                }
                                const exists = targetMessage.tool_calls.some((tc) => tc.id === statusId);
                                if (exists) return;

                                targetMessage.tool_calls.push({
                                    id: statusId,
                                    created_at: new Date().toISOString(),
                                    tool_name: data.step,
                                    arguments: {},
                                    result: data.detail ?? '',
                                    status: data.phase ?? 'running',
                                    duration_ms: null
                                });
                            })
                        }
                    })

                    eventSource.addEventListener('error', (event: MessageEvent) => {
                        const data = JSON.parse(event.data);
                        console.error('[error]', data.code, data.message);
                    });

                    eventSource.addEventListener('done', (event) => {
                        const data = JSON.parse(event.data);
                        console.log('[done]', data.reason);
                        dispatch(workspacesApi.util.invalidateTags([{ type: 'WorkspaceMessages', id: agent_id }]))
                    });

                    eventSource.onerror = () => {
                        console.log('Stream disconnected, attempting reconnect...');
                    };

                    await cacheEntryRemoved;
                    eventSource.close();
                } catch (error) {
                    console.error('Error setting up agent messages:', error);
                }
            },
        })
    })
})

export const { useNewWorkspaceMutation, useGetWorkspacesQuery, useGetWorkspaceMessagesQuery, useCreateBranchMutation, useNewMessageMutation } = workspacesApi;

export function useWorkspaceByAgentId(agentId: string | undefined) {
    const { data: workspaces, isLoading, isFetching } = useGetWorkspacesQuery();
    
    const workspace = workspaces?.find(w => 
        w.agents.some(a => a.id === Number(agentId))
    );
    const currentAgent = workspace?.agents.find(a => a.id === Number(agentId));
    
    return { workspace, currentAgent, isLoading, isFetching };
}