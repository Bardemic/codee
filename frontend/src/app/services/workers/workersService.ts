import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Tool } from "../integrations/integrationsService";

export interface LinkedWorkspace {
    id: number;
    name: string;
    status: string;
    created_at: string;
}

export interface Worker {
    id: number;
    slug: string;
    prompt: string;
    tools: Tool[];
    workspaces: LinkedWorkspace[];
}

export interface NewWorkerRequest {
    slug: string;
    prompt: string;
    tool_slugs: string[];
}

export const workersApi = createApi({
    reducerPath: 'workersApi',
    baseQuery: fetchBaseQuery({
        baseUrl: 'http://127.0.0.1:5001/api/workers/', prepareHeaders: (headers,) => {
            const token = localStorage.getItem('userToken');
            if (token) headers.set('Authorization', `Token ${token}`);
            return headers;
        },
    }),
    tagTypes: ['Workers'],
    endpoints: (builder) => ({
        getWorkers: builder.query<Worker[], void>({
            query: () => ({
                url: ''
            }),
            providesTags: ['Workers'],
        }),
        createWorker: builder.mutation<Worker, NewWorkerRequest>({
            query: (body) => ({
                url: '',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['Workers'],
        }),
        updateWorker: builder.mutation<Worker, { id: number; data: NewWorkerRequest }>({
            query: ({ id, data }) => ({
                url: `${id}/`,
                method: 'PUT',
                body: data,
            }),
            invalidatesTags: ['Workers'],
        }),
        deleteWorker: builder.mutation<void, number>({
            query: (id) => ({
                url: `${id}/`,
                method: 'DELETE',
            }),
            invalidatesTags: ['Workers'],
        }),
    })
})

export const { useGetWorkersQuery, useCreateWorkerMutation, useUpdateWorkerMutation, useDeleteWorkerMutation } = workersApi;