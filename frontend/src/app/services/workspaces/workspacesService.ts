import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react"

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
        newMessage: builder.mutation<void, { message: string, repository_name: string}>({
            query: ({ message, repository_name}) => ({
                url: 'new_workspace/',
                method: "POST",
                body: {message, repository_full_name:repository_name}
            })
        })
    })
})

export const { useNewMessageMutation } = workspacesApi;