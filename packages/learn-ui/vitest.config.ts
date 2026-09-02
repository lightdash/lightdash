import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [react()],
    test: {
        css: { modules: { classNameStrategy: 'non-scoped' } },
        globals: true,
        environment: 'jsdom',
        include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
        setupFiles: ['./src/test/setup.ts'],
    },
});
