import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

export interface Workspace {
    id: number
    created_at: Date
    name: string
}

export interface Message {
    id: number
    created_at: Date
    sender: "USER" | "AGENT"
    content: string
}

export interface NewMessageResponse {
    workspace_id: number
}

export const workspacesApi = createApi({
    reducerPath: 'workspacesApi',
    baseQuery: fetchBaseQuery({
        baseUrl: 'http://127.0.0.1:5001/api/workspace/', prepareHeaders: (headers,) => {
            const token = localStorage.getItem('userToken');
            if (token) headers.set('Authorization', `Token ${token}`);
            return headers;
        },
    }),
    endpoints: (builder) => ({
        newMessage: builder.mutation<NewMessageResponse, { message: string, repository_name: string}>({
            query: ({ message, repository_name}) => ({
                url: 'new_workspace/',
                method: "POST",
                body: {message, repository_full_name:repository_name}
            })
        }),
        getWorkspaces: builder.query<Workspace[], void>({
            query: () => ({
                url: '',
            })
        }),
        getWorkspaceMessages: builder.query<Message[], string>({
            query: (workspace_id: string) => ({
                url: `messages/${workspace_id}`,
            })
        })
    })
})

export const { useNewMessageMutation, useGetWorkspacesQuery, useGetWorkspaceMessagesQuery } = workspacesApi;