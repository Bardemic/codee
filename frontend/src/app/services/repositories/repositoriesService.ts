import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export interface Repository {
    id: number
    name: string
    default_branch: string
}

export const repositoriesApi = createApi({
    reducerPath: 'repositoriesApi',
    baseQuery: fetchBaseQuery({baseUrl: 'http://127.0.0.1:5001/repositories/', prepareHeaders: (headers, /*{getState}*/) => {
        const token = localStorage.getItem('userToken')
        if (token) headers.set('Authorization', `Token ${token}`)
        return headers
    } }),
    endpoints: (builder) => ({
        getRepositories: builder.query<Repository[], void>({
            query: () => ""
        })
    })
})

export const { useGetRepositoriesQuery } = repositoriesApi