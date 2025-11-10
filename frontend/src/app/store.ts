import type { Action, ThunkAction } from "@reduxjs/toolkit"
import { configureStore } from "@reduxjs/toolkit"
// import repositoriesReducer from "../features/repositories/repositoriesSlice"
import { authApi } from "./services/auth/authService"
import authReducer from "../features/auth/authSlice"
import { repositoriesApi } from "./services/repositories/repositoriesService"
import { setupListeners } from "@reduxjs/toolkit/query"

export const store = configureStore({
    reducer: {
        auth: authReducer,
        [repositoriesApi.reducerPath]: repositoriesApi.reducer,
        [authApi.reducerPath]: authApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(repositoriesApi.middleware, authApi.middleware)
})

setupListeners(store.dispatch);

export type AppStore = typeof store
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
export type AppThunk<ThunkReturnType = void> = ThunkAction<
    ThunkReturnType,
    RootState,
    unknown,
    Action
    >