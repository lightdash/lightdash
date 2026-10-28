import { type AiAgentReviewItemPrDiff } from '@lightdash/common';
import {
    Center,
    Loader,
    Paper,
    Stack,
    Text,
    useComputedColorScheme,
} from '@mantine/core';
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
import classes from './ReviewPrDiffContent.module.css';

type Props = {
    diff: AiAgentReviewItemPrDiff | undefined;
    isLoading: boolean;
    maxHeight?: string;
};

export const ReviewPrDiffContent: FC<Props> = ({
    diff,
    isLoading,
    maxHeight = '70vh',
}) => {
    const colorScheme = useComputedColorScheme('light');

    // Pierre's <Virtualizer> IS the scroll viewport its virtualizer tracks —
    // each file gets its own so off-screen rows render as you scroll.

    if (isLoading || !diff) {
        return (
            <Center py="xl">
                <Loader size="md" color="gray" />
            </Center>
        );
    }

    return (
        <WorkerPoolContextProvider
            poolOptions={PIERRE_POOL_OPTIONS}
            highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
        >
            <Stack gap="md">
                {diff.truncated && (
                    <Text fz="xs" c="dimmed">
                        Showing the first {diff.files.length} changed files —
                        open the PR for the full change set.
                    </Text>
                )}
                {diff.files.map((file) => (
                    <Paper
                        key={file.path}
                        radius="md"
                        className={classes.diffPanel}
                    >
                        <Virtualizer
                            className={classes.diffViewport}
                            style={
                                {
                                    '--diff-color-scheme': colorScheme,
                                    '--diff-max-height': maxHeight,
                                } as CSSProperties
                            }
                        >
                            <MultiFileDiff
                                oldFile={{
                                    name: file.path,
                                    contents: file.before,
                                }}
                                newFile={{
                                    name: file.path,
                                    contents: file.after,
                                }}
                                // color-scheme must sit on the diff host
                                // itself to override its `:host` default.
                                className={classes.diffHost}
                                renderHeaderMetadata={() => (
                                    <Text fz="xs" c="dimmed">
                                        +{file.additions} −{file.deletions}
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
                ))}
            </Stack>
        </WorkerPoolContextProvider>
    );
};
