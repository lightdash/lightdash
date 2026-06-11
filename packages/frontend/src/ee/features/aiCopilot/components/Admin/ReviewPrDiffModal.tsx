import { type AiAgentReviewItemPrDiff } from '@lightdash/common';
import {
    Center,
    Loader,
    Paper,
    Stack,
    Text,
    useComputedColorScheme,
} from '@mantine-8/core';
import {
    MultiFileDiff,
    Virtualizer,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type CSSProperties, type FC } from 'react';
import MantineModal from '../../../../../components/common/MantineModal';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from './pierreDiffConfig';

type Props = {
    opened: boolean;
    onClose: () => void;
    diff: AiAgentReviewItemPrDiff | undefined;
    isLoading: boolean;
};

export const ReviewPrDiffModal: FC<Props> = ({
    opened,
    onClose,
    diff,
    isLoading,
}) => {
    const colorScheme = useComputedColorScheme('light');

    // Pierre's <Virtualizer> IS the scroll viewport its virtualizer tracks —
    // each file gets its own so off-screen rows render as you scroll.
    const viewportStyle = {
        maxHeight: '70vh',
        overflow: 'auto',
        colorScheme,
        '--diffs-font-size': '11px',
        '--diffs-line-height': '17px',
    } as CSSProperties;

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Pull request changes"
            icon={IconGitPullRequest}
            size="80vw"
        >
            {isLoading || !diff ? (
                <Center py="xl">
                    <Loader size="md" color="gray" />
                </Center>
            ) : (
                <WorkerPoolContextProvider
                    poolOptions={PIERRE_POOL_OPTIONS}
                    highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                >
                    <Stack gap="md">
                        {diff.truncated && (
                            <Text fz="xs" c="dimmed">
                                Showing the first {diff.files.length} changed
                                files — open the PR for the full change set.
                            </Text>
                        )}
                        {diff.files.map((file) => (
                            <Paper
                                key={file.path}
                                withBorder
                                radius="md"
                                style={{ overflow: 'hidden' }}
                            >
                                <Virtualizer style={viewportStyle}>
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
                                        style={{ colorScheme }}
                                        renderHeaderMetadata={() => (
                                            <Text fz="xs" c="ldGray.6">
                                                +{file.additions} −
                                                {file.deletions}
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
            )}
        </MantineModal>
    );
};
