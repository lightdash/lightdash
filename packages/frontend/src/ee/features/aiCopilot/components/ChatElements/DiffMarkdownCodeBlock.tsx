import { Box, Group, Text, useComputedColorScheme } from '@mantine/core';
import { PatchDiff } from '@pierre/diffs/react';
import { IconFileDiff } from '@tabler/icons-react';
import { type FC } from 'react';
import { type CustomRendererProps } from 'streamdown';
import { AiMarkdownErrorBoundary } from '../../../../../components/common/AiMarkdown/AiMarkdownErrorBoundary';
import MantineIcon from '../../../../../components/common/MantineIcon';
import classes from './DiffMarkdownCodeBlock.module.css';

const PlainDiff: FC<{ code: string }> = ({ code }) => (
    <Box component="pre" className={classes.plain}>
        {code}
    </Box>
);

/** A ```diff block in a reply, drawn as a real diff; a patch that is still streaming or does not parse reads as plain text. */
export const DiffMarkdownCodeBlock: FC<CustomRendererProps> = ({
    code,
    isIncomplete,
}) => {
    const colorScheme = useComputedColorScheme('light');
    // With git's a/ and b/ prefixes the header reads as a rename of the file onto itself.
    const patch = code
        .replace(/^--- a\//m, '--- ')
        .replace(/^\+\+\+ b\//m, '+++ ');
    const path = /^\+\+\+ (.+)$/m.exec(patch)?.[1].trim() ?? null;
    const body = patch
        .split('\n')
        .filter((line) => !/^(\+\+\+|---) /.test(line));
    const added = body.filter((line) => line.startsWith('+')).length;
    const removed = body.filter((line) => line.startsWith('-')).length;
    return (
        <Box className={classes.block}>
            {path ? (
                <Group className={classes.header} gap="xs" wrap="nowrap">
                    <Group gap={6} wrap="nowrap" miw={0}>
                        <MantineIcon
                            icon={IconFileDiff}
                            size={14}
                            color="dimmed"
                        />
                        <Text className={classes.path} truncate>
                            <Text span inherit c="dimmed">
                                {path.slice(0, path.lastIndexOf('/') + 1)}
                            </Text>
                            {path.slice(path.lastIndexOf('/') + 1)}
                        </Text>
                    </Group>
                    <Group gap={4} wrap="nowrap" flex="none">
                        {added > 0 ? (
                            <Text fz="xs" c="green" ff="monospace">
                                +{added}
                            </Text>
                        ) : null}
                        {removed > 0 ? (
                            <Text fz="xs" c="red" ff="monospace">
                                −{removed}
                            </Text>
                        ) : null}
                    </Group>
                </Group>
            ) : null}
            {isIncomplete ? (
                <PlainDiff code={code} />
            ) : (
                <AiMarkdownErrorBoundary fallback={<PlainDiff code={code} />}>
                    <PatchDiff
                        // The diff does not redraw when its patch changes.
                        key={patch}
                        patch={patch}
                        className={classes.host}
                        disableWorkerPool
                        options={{
                            diffStyle: 'unified',
                            // The header above is ours: Pierre's carries a loud change icon.
                            disableFileHeader: true,
                            overflow: 'scroll',
                            hunkSeparators: 'simple',
                            diffIndicators: 'bars',
                            lineDiffType: 'word',
                            theme:
                                colorScheme === 'dark'
                                    ? 'pierre-dark'
                                    : 'pierre-light',
                        }}
                    />
                </AiMarkdownErrorBoundary>
            )}
        </Box>
    );
};
