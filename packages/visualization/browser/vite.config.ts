import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/** Serves the harness page from source, with `@lightdash/common` from its source too. */
export default defineConfig({
    root: __dirname,
    resolve: {
        alias: {
            '@lightdash/common/src': resolve(__dirname, '../../common/src'),
            '@lightdash/common': resolve(
                __dirname,
                '../../common/src/index.ts',
            ),
        },
    },
    server: { port: 3011, strictPort: true },
});
