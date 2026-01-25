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
        host: '0.0.0.0',
        allowedHosts: ['sb-28w3gyh5pb59.vercel.run'],
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
    },
});
