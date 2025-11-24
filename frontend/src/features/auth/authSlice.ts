import axios from 'axios';
import { createSlice } from '@reduxjs/toolkit';
import type  { RootState } from "../../app/store";
import { createAppAsyncThunk } from "../../app/withTypes";

const backendURL = 'http://127.0.0.1:5001';

export interface User {
    id: number
    email: string
}

type AuthStatus = 'idle' | 'pending' | 'succeeded' | 'failed'

interface AuthState {
    user: User | null
    token: string | null
    status: AuthStatus
    error: string | null
}


export interface loginInterface {
    key: string
    user: User
}

export const registerUser = createAppAsyncThunk(
    'auth/register',
    async ({ email, password}: {email: string, password: string}, { rejectWithValue }) => {
        try {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
            await axios.post(
                `${backendURL}/api/auth/register/`,
                {email, password1: password, password2: password},
                config
            )
        } catch (error: unknown) {
            return rejectWithValue(error);
        }
    }
)

export const loginUser = createAppAsyncThunk(
    'auth/login',
    async ({email, password}: {email: string, password: string}, { rejectWithValue }) => {
        try {
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
            const { data } : {data: loginInterface} = await axios.post(
                `${backendURL}/api/auth/login/`,
                {email, password},
                config
            );

            if (data.key){
                localStorage.setItem('userToken', data.key);
            }
            return data;
        } catch (error: unknown) {
            return rejectWithValue(error);
        }
    }
)


// using localstorage for now, will swap to smthn else later
const uToken = localStorage.getItem('userToken')

const initialState: AuthState = {
    user: null,
    token: uToken,
    status: 'idle',
    error: null
}


const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        logout: (state) => {
            state.user = null
            state.token = null
            state.status = 'idle'
            state.error = null
        }
    },
    extraReducers: builder => {
        builder
            .addCase(registerUser.pending, (state) => {
                state.status = 'pending'
                state.error = null
            })
            .addCase(registerUser.fulfilled, (state) => {
                state.status = 'succeeded'
                // extra logic
            })
            .addCase(registerUser.rejected, (state, {payload}) => {
                state.status = 'failed'
                state.error = String(payload)
            })
            .addCase(loginUser.pending, (state) => {
                state.status = 'pending'
                state.error = null
            })
            .addCase(loginUser.fulfilled, (state, {payload}) => {
                state.status = 'succeeded'
                state.token = payload.key
                state.user = payload.user
            })
            .addCase(loginUser.rejected, (state, {payload}) => {
                state.status = 'failed'
                state.error = String(payload)
            })
    },
})

export const { logout } = authSlice.actions
export default authSlice.reducer

export const getAuth = (state: RootState) => state.auth.user
export const getAuthStatus = (state: RootState) => state.auth.status
