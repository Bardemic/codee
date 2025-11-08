import axios from 'axios';
import { createSlice } from '@reduxjs/toolkit';
import { createAppAsyncThunk } from '../../app/withTypes';
import type  { RootState } from "../../app/store";


export interface Repository {
    id: string
    name: string
    default_branch: string
    created_at: Date
}

interface RepositoriesState {
    repositories: Repository[]
    status: 'idle' | 'pending' | 'suceeded' | 'failed'
    error: string | null
}

const initialState: RepositoriesState = {
    repositories: [],
    status: 'idle',
    error: null
}

const repositoriesSlice = createSlice({
    name: 'repositories',
    initialState,
    reducers: {

    },
    extraReducers: builder => {
        builder
            .addCase(fetchRepositories.pending, (state) => {
                state.status = 'pending'
            })
            .addCase(fetchRepositories.fulfilled, (state, action) => {
                state.status = 'suceeded'
                state.repositories.push(...action.payload)
            })
            .addCase(fetchRepositories.rejected, (state, action) => {
                state.status = 'failed'
                state.error = action.error.message ?? "Unknown error"
            })
    }
})

export default repositoriesSlice.reducer

export const fetchRepositories = createAppAsyncThunk<Repository[]>(
    'repositories/fetchRepositories',
    async () => {
        const response = await axios.get<Repository[]>('http://127.0.0.1:5001/repositories');
        return response.data;
    },
    {
        condition(arg, thunkApi) {
            const repoStatus = selectRepositoriesStatus(thunkApi.getState())
            if (repoStatus != "idle"){
                return false
            }
        }
    }
)

export const selectAllRepositories = (state: RootState) => state.repositories.repositories
export const selectRepositoriesStatus = (state:RootState) => state.repositories.status