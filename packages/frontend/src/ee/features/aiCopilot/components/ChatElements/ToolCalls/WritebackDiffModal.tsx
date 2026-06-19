import {
    Box,
    Center,
    Flex,
    Group,
    Loader,
    NavLink,
    Paper,
    Text,
    useComputedColorScheme,
} from '@mantine-8/core';
import {
    PatchDiff,
    WorkerPoolContextProvider,
    type WorkerInitializationRenderOptions,
    type WorkerPoolOptions,
} from '@pierre/diffs/react';
// Vite resolves this to the bundled worker URL.
// oxlint-disable-next-line import/default
import DiffsWorkerUrl from '@pierre/diffs/worker/worker.js?worker&url';
import { IconFileDiff } from '@tabler/icons-react';
import { useMemo, useState, type CSSProperties, type FC } from 'react';
import MantineModal from '../../../../../../components/common/MantineModal';
import { usePullRequestDiff } from '../../../hooks/usePullRequestDiff';

// Tokenize with both Pierre themes; the diff renders via CSS `light-dark()`.
// Writeback PRs touch dbt YAML/SQL plus the odd markdown doc, so cover those.
const HIGHLIGHTER_OPTIONS: WorkerInitializationRenderOptions = {
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    langs: ['yaml', 'sql', 'markdown'],
    preferredHighlighter: 'shiki-wasm',
};

const POOL_OPTIONS: WorkerPoolOptions = {
    poolSize: 2,
    workerFactory() {
        return new Worker(DiffsWorkerUrl, { type: 'module' });
    },
};

// The dialog itself must never scroll — only the file list and the diff scroll,
// independently. MantineModal caps its body scroll-area at BODY_MAX_HEIGHT and
// wraps the content in a Stack with `py="md"` (16px top + bottom). So the
// viewer fills BODY_MAX_HEIGHT minus that 32px padding and the body's own
// scroll area is exactly full — no outer scrollbar.
const BODY_MAX_HEIGHT = 'calc(80vh - 140px)';
const VIEWER_HEIGHT = 'calc(80vh - 140px - 32px)';

type DiffFile = {
    key: string;
    /** Full b-side path, e.g. `dbt/models/customers.yml`. */
    path: string;
    patch: string;
    additions: number;
    deletions: number;
};

// `PatchDiff` renders exactly one file, so a multi-file PR diff is split into
// its per-file sections (each starts with a `diff --git` line). We also tally
// each section's +/- so the file list can show a per-file stat. The b-side path
// keys each file; an index suffix guards two sections resolving to the same
// name (e.g. a rename pair).
const splitPatchIntoFiles = (patch: string): DiffFile[] =>
    patch
        .split(/\n(?=diff --git )/g)
        .map((section) => section.trim())
        .filter(Boolean)
        .map((section, index) => {
            const path =
                section.match(/^diff --git a\/.+? b\/(.+)$/m)?.[1] ?? 'file';
            let additions = 0;
            let deletions = 0;
            for (const line of section.split('\n')) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                    additions += 1;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                    deletions += 1;
                }
            }
            return {
                key: `${path}-${index}`,
                path,
                patch: section,
                additions,
                deletions,
            };
        });

const SingleFileDiff: FC<{ patch: string }> = ({ patch }) => {
    const colorScheme = useComputedColorScheme('light');

    // We render one file at a time, so there's no need for Pierre's
    // <Virtualizer> — and avoiding it sidesteps its height *estimate*, which
    // over-reserves scroll space for collapsed-context regions and lets you
    // scroll past the end of the diff. PatchDiff renders all its rows, so the
    // Paper is just a plain scroll container whose scrollHeight equals the real
    // content. colorScheme pins the diff's light-dark() to the app theme.
    const scrollStyle = {
        overflow: 'auto',
        colorScheme,
    } as CSSProperties;

    return (
        <WorkerPoolContextProvider
            poolOptions={POOL_OPTIONS}
            highlighterOptions={HIGHLIGHTER_OPTIONS}
        >
            <Paper withBorder radius="md" w="100%" h="100%" style={scrollStyle}>
                <PatchDiff
                    // Remount per file so the highlighter resets cleanly.
                    key={patch.slice(0, 80)}
                    patch={patch}
                    style={{ colorScheme }}
                    options={{
                        diffStyle: 'unified',
                        theme:
                            colorScheme === 'dark'
                                ? 'pierre-dark'
                                : 'pierre-light',
                    }}
                />
            </Paper>
        </WorkerPoolContextProvider>
    );
};

// File-list sidebar + the selected file's diff. The split-and-select layout
// keeps each diff a single file (what PatchDiff wants) and makes a large
// many-file PR easy to navigate.
const DiffBrowser: FC<{ patch: string }> = ({ patch }) => {
    const files = useMemo(() => splitPatchIntoFiles(patch), [patch]);
    const [selectedKey, setSelectedKey] = useState(files[0]?.key);
    const selected =
        files.find((f) => f.key === selectedKey) ?? files[0] ?? null;

    if (!selected) {
        return (
            <Text size="sm" c="dimmed" py="md">
                This pull request has no file changes.
            </Text>
        );
    }

    return (
        <Flex gap="md" align="stretch" w="100%" h={VIEWER_HEIGHT}>
            <Box
                w={260}
                miw={260}
                h="100%"
                style={{ overflowY: 'auto', overflowX: 'hidden' }}
            >
                <Text size="xs" c="dimmed" fw={600} px="xs" pb={4}>
                    {files.length} file{files.length > 1 ? 's' : ''} changed
                </Text>
                {files.map((file) => (
                    <NavLink
                        key={file.key}
                        active={file.key === selected.key}
                        onClick={() => setSelectedKey(file.key)}
                        label={
                            <Group gap="xs" wrap="nowrap">
                                {/* Filename only — left-aligned and truncated;
                                    the full path is in the title tooltip. */}
                                <Text
                                    size="xs"
                                    truncate="end"
                                    flex={1}
                                    miw={0}
                                    title={file.path}
                                >
                                    {file.path.split('/').pop() ?? file.path}
                                </Text>
                                <Group gap={4} wrap="nowrap" ff="monospace">
                                    {file.additions > 0 && (
                                        <Text size="xs" c="green">
                                            +{file.additions}
                                        </Text>
                                    )}
                                    {file.deletions > 0 && (
                                        <Text size="xs" c="red">
                                            −{file.deletions}
                                        </Text>
                                    )}
                                </Group>
                            </Group>
                        }
                    />
                ))}
            </Box>
            <Box flex={1} miw={0} h="100%">
                <SingleFileDiff patch={selected.patch} />
            </Box>
        </Flex>
    );
};

export const WritebackDiffModal: FC<{
    projectUuid: string;
    prUrl: string;
    commitSha: string | null;
    opened: boolean;
    onClose: () => void;
}> = ({ projectUuid, prUrl, commitSha, opened, onClose }) => {
    const { data, isInitialLoading, isError } = usePullRequestDiff(
        projectUuid,
        prUrl,
        commitSha,
        opened,
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Pull request diff"
            icon={IconFileDiff}
            size="90%"
            bodyScrollAreaMaxHeight={BODY_MAX_HEIGHT}
            cancelLabel={false}
        >
            {isInitialLoading ? (
                <Center p="xl">
                    <Loader size="sm" />
                </Center>
            ) : isError || !data || !data.diff ? (
                <Text size="sm" c="dimmed" py="md">
                    Couldn't load the diff for this pull request.
                </Text>
            ) : (
                <DiffBrowser patch={data.diff} />
            )}
        </MantineModal>
    );
};
