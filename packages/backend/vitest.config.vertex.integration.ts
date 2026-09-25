import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
    ...base,
    test: {
        ...base.test,
        name: 'backend-vertex-live-tests',
        include: [
            'src/ee/services/ai/models/google-vertex.integration.test.ts',
        ],
        exclude: [],
        maxWorkers: 1,
    },
});
