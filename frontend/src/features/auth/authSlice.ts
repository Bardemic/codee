import axios from 'axios';
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import type  { RootState } from "../../app/store";

const backendURL = 'http://127.0.0.1:5001';

export interface User {
    id: number
    email: string
}

interface AuthState {
    user: User | null
    token: string | null
    status: 'idle' |'pending' | 'suceeded' | 'failed'
    error: string | null
}


export interface loginInterface {
    key: string
    user: User
}

export const registerUser = createAsyncThunk(
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

export const loginUser = createAsyncThunk(
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
    reducers: {},
    extraReducers: builder => {
        builder
            .addCase(registerUser.pending, (state) => {
                state.status = 'pending'
                state.error = null
            })
            .addCase(registerUser.fulfilled, (state) => {
                state.status = 'suceeded'
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
                state.status = 'suceeded'
                state.token = payload.key
                state.user = payload.user
            })
            .addCase(loginUser.rejected, (state, {payload}) => {
                state.status = 'failed'
                state.error = String(payload)
            })
    },
})

export default authSlice.reducer

export const getAuth = (state: RootState) => state.auth.user
export const getAuthStatus = (state: RootState) => state.auth.status