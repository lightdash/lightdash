import {
    ActionIcon,
    Box,
    Group,
    Text,
    Tooltip,
    useComputedColorScheme,
} from '@mantine/core';
import { getSingularPatch } from '@pierre/diffs';
import { FileDiff, Virtualizer } from '@pierre/diffs/react';
import { IconArrowsDiagonal, IconFileDiff } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { type CustomRendererProps } from 'streamdown';
import { AiMarkdownErrorBoundary } from '../../../../../components/common/AiMarkdown/AiMarkdownErrorBoundary';
import MantineIcon from '../../../../../components/common/MantineIcon';
import MantineModal from '../../../../../components/common/MantineModal';
import classes from './DiffMarkdownCodeBlock.module.css';

const PlainDiff: FC<{ code: string }> = ({ code }) => (
    <Box component="pre" className={classes.plain}>
        {code}
    </Box>
);

type DiffProps = { patch: string; overflow: 'scroll' | 'wrap' };

const DrawnDiff: FC<DiffProps> = ({ patch, overflow }) => {
    const colorScheme = useComputedColorScheme('light');
    // Plain text draws at once; a highlighted language draws later, and under StrictMode that later never comes.
    const fileDiff = useMemo(
        () => ({ ...getSingularPatch(patch), lang: 'text' as const }),
        [patch],
    );
    // Outside its own viewport the diff never draws once its header is turned off.
    return (
        <Virtualizer>
            <FileDiff
                // The diff does not redraw when its patch changes.
                key={patch}
                fileDiff={fileDiff}
                className={classes.host}
                options={{
                    diffStyle: 'unified',
                    // The header is ours: Pierre's carries a loud change icon.
                    disableFileHeader: true,
                    overflow,
                    hunkSeparators: 'simple',
                    diffIndicators: 'bars',
                    lineDiffType: 'word',
                    theme:
                        colorScheme === 'dark' ? 'pierre-dark' : 'pierre-light',
                }}
            />
        </Virtualizer>
    );
};

const Diff: FC<DiffProps & { code: string }> = ({ code, ...diff }) => (
    <AiMarkdownErrorBoundary fallback={<PlainDiff code={code} />}>
        <DrawnDiff {...diff} />
    </AiMarkdownErrorBoundary>
);

/** A ```diff block in a reply, drawn as a real diff; a patch that is still streaming or does not parse reads as plain text. */
export const DiffMarkdownCodeBlock: FC<CustomRendererProps> = ({
    code,
    isIncomplete,
}) => {
    const [isExpanded, setIsExpanded] = useState(false);
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
                    <Group gap="xs" wrap="nowrap" flex="none">
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
                        {isIncomplete ? null : (
                            <Tooltip label="Expand">
                                <ActionIcon
                                    size="xs"
                                    aria-label="Expand"
                                    onClick={() => setIsExpanded(true)}
                                >
                                    <MantineIcon icon={IconArrowsDiagonal} />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </Group>
            ) : null}
            {isIncomplete ? (
                <PlainDiff code={code} />
            ) : (
                <Diff code={code} patch={patch} overflow="scroll" />
            )}
            <MantineModal
                opened={isExpanded}
                onClose={() => setIsExpanded(false)}
                title={path ?? 'Proposed change'}
                icon={IconFileDiff}
                size="xl"
                cancelLabel={false}
            >
                <Box className={classes.expanded}>
                    <Diff code={code} patch={patch} overflow="wrap" />
                </Box>
            </MantineModal>
        </Box>
    );
};
