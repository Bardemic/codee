import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";


export interface Repository {
    github_id: number
    name: string
    default_branch: string
}

export interface Tool {
    id: number
    display_name: string
    slug_name: string
}

export interface Integration {
    id: number
    name: string
    connected: boolean
    connection_id: number | null
    tools: Tool[]
}


export const integrationsApi = createApi({
    reducerPath: 'integrationsApi',
    baseQuery: fetchBaseQuery({
        baseUrl: 'http://127.0.0.1:5001/integrations/', prepareHeaders: (headers,) => {
            const token = localStorage.getItem('userToken');
            if (token) headers.set('Authorization', `Token ${token}`);
            return headers;
        },
    }),
    tagTypes: ['Integrations', 'Repositories'],
    endpoints: (builder) => ({
        addIntegration: builder.mutation<void, { type: string; data: unknown }>({ //data is a json
            query: ({ type, data }) => ({
                url: `${type}/connect/`,
                method: "POST",
                body: data,
            }),
            invalidatesTags: ['Integrations', 'Repositories'],
        }),
        getRepositories: builder.query<Repository[], void>({
            query: () => "github/repositories/",
            providesTags: ['Repositories'],
        }),
        getIntegrations: builder.query<Integration[], void>({
            query: () => "",
            providesTags: ['Integrations']
        }),
        deleteIntegration: builder.mutation<void, number>({
            query: (key: number) => ({
                url: `${key}/`,
                method: "DELETE"
            }),
            invalidatesTags: ['Integrations', 'Repositories'],
        })
    })
})

export const { useDeleteIntegrationMutation, useGetRepositoriesQuery, useAddIntegrationMutation, useGetIntegrationsQuery } = integrationsApi;
