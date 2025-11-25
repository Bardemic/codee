import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { Tool } from "../integrations/integrationsService";

export interface Worker {
    id: number;
    prompt: string;
    tools: Tool[];
}

export interface NewWorkerRequest {
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
        })
    })
})

export const { useGetWorkersQuery, useCreateWorkerMutation } = workersApi;