import {
    type WorkerInitializationRenderOptions,
    type WorkerPoolOptions,
} from '@pierre/diffs/react';
// Vite resolves this to the bundled worker URL.
// oxlint-disable-next-line import/default
import DiffsWorkerUrl from '@pierre/diffs/worker/worker.js?worker&url';

// Tokenize with both Pierre themes; diffs render via CSS `light-dark()` and
// hosts pin `color-scheme` to Mantine's computed scheme.
export const PIERRE_HIGHLIGHTER_OPTIONS: WorkerInitializationRenderOptions = {
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    langs: ['yaml', 'sql', 'markdown', 'json'],
    preferredHighlighter: 'shiki-wasm',
};

export const PIERRE_POOL_OPTIONS: WorkerPoolOptions = {
    poolSize: 2,
    workerFactory() {
        return new Worker(DiffsWorkerUrl, { type: 'module' });
    },
};
