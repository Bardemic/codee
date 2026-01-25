import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
    },
    server: {
        port: 5173,
        strictPort: true,
        allowedHosts: ['sb-14uqjmejpz5r.vercel.run'],
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
