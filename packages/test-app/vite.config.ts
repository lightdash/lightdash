import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [react()],
    // resolve: {
    //     preserveSymlinks: true,
    // },
    server: {
        port: 3001,
        host: true,
    },
});
