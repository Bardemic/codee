import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export interface Workspace {
    id: number
    created_at: Date
    name: string
    status: "PENDING" | "RUNNING" | "COMPLETED" | "FAILED"
    github_branch_name: string | null
    github_repository_name: string
}

export interface NewWorkspaceResponse {
    workspace_id: number
}

export interface ToolCall {
    id: number | string
    created_at: Date
    tool_name: string
    arguments: Record<string, unknown>
    result: string
    status: string
    duration_ms: number | null
}

export interface Message {
    id: number | string
    created_at: Date
    sender: "USER" | "AGENT"
    content: string
    tool_calls: ToolCall[]
    isPendingAgent?: boolean
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
        newWorkspace: builder.mutation<NewWorkspaceResponse, { message: string, repository_name: string}>({
            query: ({ message, repository_name}) => ({
                url: 'new_workspace/',
                method: "POST",
                body: {message, repository_full_name:repository_name}
            }),
            invalidatesTags: ['Workspaces']
        }),
        newMessage: builder.mutation<void, {message: string, workspace_id: number}>({
            query: ({message, workspace_id}: {message: string, workspace_id: number}) => ({
                url: `${workspace_id}/message/`,
                method: "POST",
                body: {message}
            }),
            invalidatesTags: (_, __, workspace_id) => [
                {type: 'Workspace', workspace_id}
            ]
        }),
        createBranch: builder.mutation<void, string>({
            query: (workspace_id: string) => ({
                url: `${workspace_id}/create-branch/`,
                method: "POST",
            }),
            invalidatesTags: (_, __, workspace_id) => [
                { type: 'Workspace', workspace_id}
            ]
        }),
        getWorkspaces: builder.query<Workspace[], void>({
            query: () => ({
                url: '',
            }),
            providesTags: ['Workspaces']
        }),
        getWorkspace: builder.query<Workspace, string>({
            query: (id: string) => ({
                url: `/${id}`,
            }),
            providesTags: (_, __, id) => [
                { type: 'Workspace', id}
            ]
        }),
        getWorkspaceMessages: builder.query<Message[], string>({
            query: (workspace_id: string) => ({
                url: `messages/${workspace_id}`,
            }),
            providesTags: (_result, _error, workspace_id) => [{ type: 'WorkspaceMessages', id: workspace_id }],
            async onCacheEntryAdded(
                workspace_id,
                {updateCachedData, cacheDataLoaded, cacheEntryRemoved, dispatch},
            ) {
                try {
                    await cacheDataLoaded

                    let shouldStream = false;
                    try {
                        const statusResponse = await fetch(`http://127.0.0.1:5001/api/workspace/${workspace_id}/status/`, {
                            headers: {
                                'Authorization': `Token ${localStorage.getItem('userToken')}`
                            }
                        });

                        if (statusResponse.ok) {
                            const statusData = await statusResponse.json();
                            shouldStream = statusData.status === 'PENDING' || statusData.status === 'RUNNING';
                        } else {
                            console.warn('Failed to fetch workspace status', statusResponse.status);
                            shouldStream = true;
                        }
                    } catch (statusError) {
                        console.warn('Unable to determine workspace status', statusError);
                        shouldStream = true;
                    }

                    if (shouldStream) {
                        const eventSource = new EventSource(`http://localhost:8000/stream/${workspace_id}`);

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
                                            created_at: new Date(),
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
                                        created_at: new Date(),
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
                            eventSource.close();
                            dispatch(workspacesApi.util.invalidateTags([{ type: 'WorkspaceMessages', id: workspace_id }]))
                        });

                        eventSource.onerror = () => {
                            eventSource.close();
                        };

                        await cacheEntryRemoved;
                        eventSource.close();
                    }
                } catch (error) {
                    console.error('Error setting up workspace messages:', error);
                }
            },
        })
    })
})

export const { useNewWorkspaceMutation, useGetWorkspacesQuery, useGetWorkspaceMessagesQuery, useGetWorkspaceQuery, useCreateBranchMutation, useNewMessageMutation } = workspacesApi;