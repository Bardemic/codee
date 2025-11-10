import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import { logout } from "../../../features/auth/authSlice";


export interface User {
    email: string
}
export const authApi = createApi({
    reducerPath: 'authApi',
    baseQuery: fetchBaseQuery({ baseUrl: 'http://127.0.0.1:5001/api/auth/', prepareHeaders: (headers, /*{getState}*/) => {
        const token = localStorage.getItem('userToken');
        if (token) headers.set('Authorization', `Token ${token}`);
        return headers;
    }}),
    endpoints: (builder) => ({
        getUserInfo: builder.query<User, void>({
            query: () => "user/"
        }),
        userSignout: builder.mutation<void, void>({
            query: () => ({
                url: "logout/",
                method: "POST",
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    await queryFulfilled;
                    localStorage.removeItem('userToken');
                    dispatch(logout());
                    dispatch(authApi.util.resetApiState());
                } catch {
                    return;
                }
            }
        })
    }),
});

export const { useGetUserInfoQuery, useUserSignoutMutation } = authApi