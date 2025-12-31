import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { trpc, trpcClient, queryClient } from './lib/trpc';
import './index.css';
import App from './App.tsx';
import { attachCodeCopyButtons } from './utils/clipboard';

function init() {
  // Initialize clipboard copy buttons for code blocks
  try {
    attachCodeCopyButtons();
  } catch {
    // ignore init errors
  }
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
            <QueryClientProvider client={queryClient}>
                <App />
            </QueryClientProvider>
        </trpc.Provider>
    </StrictMode>
);

// Run init after app mounted
init();
