import type { Action, ThunkAction } from "@reduxjs/toolkit"
import { configureStore } from "@reduxjs/toolkit"
// import repositoriesReducer from "../features/repositories/repositoriesSlice"
import { authApi } from "./services/auth/authService"
import authReducer from "../features/auth/authSlice"
import { integrationsApi } from "./services/integrations/integrationsService"
import { setupListeners } from "@reduxjs/toolkit/query"
import { workspacesApi } from "./services/workspaces/workspacesService"

export const store = configureStore({
    reducer: {
        auth: authReducer,
        [integrationsApi.reducerPath]: integrationsApi.reducer,
        [authApi.reducerPath]: authApi.reducer,
        [workspacesApi.reducerPath]: workspacesApi.reducer,
    },
    middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware().concat(integrationsApi.middleware, authApi.middleware, workspacesApi.middleware)
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