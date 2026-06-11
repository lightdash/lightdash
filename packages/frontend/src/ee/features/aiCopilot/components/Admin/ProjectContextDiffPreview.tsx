import { Paper, Text, useComputedColorScheme } from '@mantine-8/core';
import {
    MultiFileDiff,
    Virtualizer,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import { type CSSProperties, type FC } from 'react';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from './pierreDiffConfig';

type ProjectContextDiffPreviewProps = {
    fileName: string;
    before: string;
    after: string;
    op: 'create' | 'update';
};

export const ProjectContextDiffPreview: FC<ProjectContextDiffPreviewProps> = ({
    fileName,
    before,
    after,
    op,
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
            poolOptions={PIERRE_POOL_OPTIONS}
            highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
        >
            <Paper
                withBorder
                shadow="sm"
                radius="md"
                style={{ overflow: 'hidden' }}
            >
                <Virtualizer style={viewportStyle}>
                    <MultiFileDiff
                        oldFile={{ name: fileName, contents: before }}
                        newFile={{ name: fileName, contents: after }}
                        // color-scheme must sit on the diff host itself to override
                        // its `:host { color-scheme: light dark }` — otherwise the
                        // backgrounds follow the OS, not the app theme.
                        style={{ colorScheme }}
                        // Surface the create/update intent in Pierre's own file
                        // header so the modal doesn't need a separate description.
                        renderHeaderMetadata={() => (
                            <Text fz="xs" c="ldGray.6">
                                {op === 'update'
                                    ? 'Updates entry'
                                    : 'Adds entry'}
                            </Text>
                        )}
                        options={{
                            diffStyle: 'split',
                            theme:
                                colorScheme === 'dark'
                                    ? 'pierre-dark'
                                    : 'pierre-light',
                        }}
                    />
                </Virtualizer>
            </Paper>
        </WorkerPoolContextProvider>
    );
};
