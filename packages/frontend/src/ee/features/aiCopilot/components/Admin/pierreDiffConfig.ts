import {
    type WorkerInitializationRenderOptions,
    type WorkerPoolOptions,
} from '@pierre/diffs/react';
// Vite resolves this to the bundled worker URL.
// oxlint-disable-next-line import/default
import DiffsWorkerUrl from '@pierre/diffs/worker/worker.js?worker&url';

// Tokenize with both Pierre themes; diffs render via CSS `light-dark()` and
// hosts pin `color-scheme` to Mantine's computed scheme.
const PIERRE_THEMES = { dark: 'pierre-dark', light: 'pierre-light' } as const;

/** Pierre's themes, with its colour scheme pinned to the app's rather than the system's. */
export const pierreThemeFor = (colorScheme: 'light' | 'dark') =>
    ({ theme: PIERRE_THEMES, themeType: colorScheme }) as const;

export const PIERRE_HIGHLIGHTER_OPTIONS: WorkerInitializationRenderOptions = {
    theme: PIERRE_THEMES,
    langs: ['yaml', 'sql', 'markdown', 'json'],
    preferredHighlighter: 'shiki-wasm',
};

export const PIERRE_POOL_OPTIONS: WorkerPoolOptions = {
    poolSize: 2,
    workerFactory() {
        return new Worker(DiffsWorkerUrl, { type: 'module' });
    },
};
