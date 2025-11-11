import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";


export interface Repository {
    github_id: number
    name: string
    default_branch: string
}

export interface Integration {
    id: number
    name: string
    connected: boolean
    connection_id: number | null
}


export const integrationsApi = createApi({
    reducerPath: 'integrationsApi',
    baseQuery: fetchBaseQuery({
        baseUrl: 'http://127.0.0.1:5001/integrations/', prepareHeaders: (headers,) => {
            const token = localStorage.getItem('userToken');
            if (token) headers.set('Authorization', `Token ${token}`);
            return headers;
        }
    }),
    endpoints: (builder) => ({
        addIntegration: builder.mutation<void, { type: string; data: unknown }>({ //data is a json
            query: ({ type, data }) => ({
                url: `${type}/connect/`,
                method: "POST",
                body: data,
            }),
        }),
        getRepositories: builder.query<Repository[], void>({
            query: () => "github/repositories/"
        }),
        getIntegrations: builder.query<Integration[], void>({
            query: () => ""
        }),
        deleteIntegration: builder.mutation<void, number>({
            query: (key: number) => ({
                url: `${key}/`,
                method: "DELETE"
            })
        })
    })
})

export const { useDeleteIntegrationMutation, useGetRepositoriesQuery, useAddIntegrationMutation, useGetIntegrationsQuery } = integrationsApi;