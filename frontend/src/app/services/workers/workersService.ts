import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";

export const workersApi = createApi({
    reducerPath: 'workersApi',
    baseQuery: fetchBaseQuery({
        baseUrl: 'http://127.0.0.1:5001/api/workers/', prepareHeaders: (headers,) => {
            const token = localStorage.getItem('userToken');
            if (token) headers.set('Authorization', `Token ${token}`);
            return headers;
        },
    }),
    endpoints: (builder) => ({
        getWorkers: builder.query<void, void>({
            query: () => ({
                url: ''
            })
        })
    })
})

export const { useGetWorkersQuery } = workersApi;