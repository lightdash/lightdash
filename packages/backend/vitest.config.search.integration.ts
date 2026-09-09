import { defineConfig } from 'vitest/config';
import base from './vitest.config';

export default defineConfig({
    ...base,
    test: {
        ...base.test,
        name: 'search-integration-tests',
        include: [
            'src/models/SearchModel/SearchModel.explores.integration.test.ts',
        ],
        exclude: [],
        testTimeout: 120000,
        hookTimeout: 60000,
    },
});
