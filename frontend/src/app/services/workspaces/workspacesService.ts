import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export interface Workspace {
    id: number
    created_at: string
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

export interface PaginatedResponse<T> {
    count: number
    page: number
    page_size: number
    next_page: number | null
    previous_page: number | null
    results: T[]
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
        newWorkspace: builder.mutation<NewWorkspaceResponse, { message: string, repository_name: string, tool_slugs: string[]}>({
            query: ({ message, repository_name, tool_slugs}) => ({
                url: 'new_workspace/',
                method: "POST",
                body: {message, repository_full_name:repository_name, tool_slugs}
            }),
            invalidatesTags: ['Workspaces']
        }),
        newMessage: builder.mutation<void, {message: string, workspace_id: number}>({
            query: ({message, workspace_id}: {message: string, workspace_id: number}) => ({
                url: `${workspace_id}/message/`,
                method: "POST",
                body: {message}
            }),
            invalidatesTags: (_, __, arg) => [
                { type: 'Workspace', id: arg.workspace_id },
                { type: 'WorkspaceMessages', id: arg.workspace_id }
            ]
        }),
        createBranch: builder.mutation<void, string>({
            query: (workspace_id: string) => ({
                url: `${workspace_id}/create-branch/`,
                method: "POST",
            }),
            invalidatesTags: (_, __, workspace_id) => [
                { type: 'Workspace', id: workspace_id }
            ]
        }),
        getWorkspaces: builder.query<PaginatedResponse<Workspace>, { page?: number; page_size?: number } | void>({
            query: (args) => {
                const params = new URLSearchParams();
                const page = (args as any)?.page;
                const page_size = (args as any)?.page_size;
                if (page) params.set('page', String(page));
                if (page_size) params.set('page_size', String(page_size));
                const queryString = params.toString();
                return {
                    url: queryString ? `?${queryString}` : '',
                };
            },
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

                    const baseStreamUrl = `http://localhost:8000/stream/${workspace_id}`;
                    let streamUrl = baseStreamUrl;

                    try {
                        const statusResponse = await fetch(`http://127.0.0.1:5001/api/workspace/${workspace_id}/status/`, {
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
                        console.warn('Unable to determine workspace status for stream start', statusError);
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
                                    } as Message;
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
                        dispatch(workspacesApi.util.invalidateTags([{ type: 'WorkspaceMessages', id: workspace_id }]))
                    });

                    eventSource.onerror = () => {
                        console.log('Stream disconnected, attempting reconnect...');
                    };

                    await cacheEntryRemoved;
                    eventSource.close();
                } catch (error) {
                    console.error('Error setting up workspace messages:', error);
                }
            },
        })
    })
})

export const { useNewWorkspaceMutation, useGetWorkspacesQuery, useGetWorkspaceMessagesQuery, useGetWorkspaceQuery, useCreateBranchMutation, useNewMessageMutation } = workspacesApi;