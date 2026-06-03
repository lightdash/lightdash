import { useComputedColorScheme } from '@mantine-8/core';
import {
    MultiFileDiff,
    Virtualizer,
    type WorkerInitializationRenderOptions,
    WorkerPoolContextProvider,
    type WorkerPoolOptions,
} from '@pierre/diffs/react';
// Vite resolves this to the bundled worker URL.
// oxlint-disable-next-line import/default
import DiffsWorkerUrl from '@pierre/diffs/worker/worker.js?worker&url';
import { type CSSProperties, type FC } from 'react';

// Tokenize with both Pierre themes; the diff renders via CSS `light-dark()`. We
// pin the host's `color-scheme` to Mantine's computed scheme below so the diff
// follows the app's light/dark toggle rather than the OS preference.
const HIGHLIGHTER_OPTIONS: WorkerInitializationRenderOptions = {
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    langs: ['yaml'],
    preferredHighlighter: 'shiki-wasm',
};

const POOL_OPTIONS: WorkerPoolOptions = {
    poolSize: 2,
    workerFactory() {
        return new Worker(DiffsWorkerUrl, { type: 'module' });
    },
};

type ProjectContextDiffPreviewProps = {
    fileName: string;
    before: string;
    after: string;
};

export const ProjectContextDiffPreview: FC<ProjectContextDiffPreviewProps> = ({
    fileName,
    before,
    after,
}) => {
    const colorScheme = useComputedColorScheme('light');

    // Pierre's <Virtualizer> IS the scroll viewport its virtualizer tracks —
    // a plain overflow:auto div doesn't work (off-screen rows never render).
    // overflow:auto here gives both vertical and horizontal scroll; colorScheme
    // pins the diff's light-dark() to the app theme; --diffs-font-size shrinks
    // the dense YAML (both CSS vars inherit through the diff's shadow DOM).
    const viewportStyle = {
        maxHeight: '60vh',
        overflow: 'auto',
        colorScheme,
        '--diffs-font-size': '11px',
        '--diffs-line-height': '17px',
    } as CSSProperties;

    return (
        <WorkerPoolContextProvider
            poolOptions={POOL_OPTIONS}
            highlighterOptions={HIGHLIGHTER_OPTIONS}
        >
            <Virtualizer style={viewportStyle}>
                <MultiFileDiff
                    oldFile={{ name: fileName, contents: before }}
                    newFile={{ name: fileName, contents: after }}
                    options={{
                        diffStyle: 'split',
                        theme:
                            colorScheme === 'dark'
                                ? 'pierre-dark'
                                : 'pierre-light',
                    }}
                />
            </Virtualizer>
        </WorkerPoolContextProvider>
    );
};
