import { type ContentDraftSummary } from '@lightdash/common';
import {
    Badge,
    Button,
    Group,
    Paper,
    ScrollArea,
    Stack,
    Text,
    useComputedColorScheme,
} from '@mantine/core';
import {
    MultiFileDiff,
    Virtualizer,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import { IconGitPullRequest, IconX } from '@tabler/icons-react';
import { useState, type CSSProperties, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import {
    useContentDraftReview,
    useContentDrafts,
    useDismissDraftMutation,
    useWriteBackDraftMutation,
} from '../hooks/useContentDrafts';

const statusColor: Record<ContentDraftSummary['status'], string> = {
    open: 'yellow',
    written_back: 'green',
    dismissed: 'gray',
};
const statusLabel: Record<ContentDraftSummary['status'], string> = {
    open: 'Awaiting review',
    written_back: 'PR opened',
    dismissed: 'Dismissed',
};

type ContentReviewPageProps = {
    projectUuid: string | undefined;
};

const ContentReviewPage: FC<ContentReviewPageProps> = ({ projectUuid }) => {
    const colorScheme = useComputedColorScheme('light');
    const { data: drafts } = useContentDrafts(projectUuid);
    const [selectedUuid, setSelectedUuid] = useState<string | undefined>();
    const activeUuid = selectedUuid ?? drafts?.[0]?.uuid;
    const { data: review } = useContentDraftReview(projectUuid, activeUuid);
    const { mutate: writeBack, isLoading: isWritingBack } =
        useWriteBackDraftMutation(projectUuid);
    const { mutate: dismiss } = useDismissDraftMutation(projectUuid);

    const active = drafts?.find((draft) => draft.uuid === activeUuid);

    // Pierre's <Virtualizer> IS the scroll viewport its virtualizer tracks
    const viewportStyle = {
        maxHeight: '62vh',
        overflow: 'auto',
        colorScheme,
        '--diffs-font-size': '11px',
        '--diffs-line-height': '17px',
    } as CSSProperties;

    return (
        <Group align="flex-start" gap="md" wrap="nowrap">
            <Stack w={300} gap="xs" style={{ flexShrink: 0 }}>
                <ScrollArea.Autosize mah="70vh">
                    <Stack gap="xs">
                        {(drafts ?? []).map((draft) => (
                            <Paper
                                key={draft.uuid}
                                withBorder
                                p="sm"
                                onClick={() => setSelectedUuid(draft.uuid)}
                                style={{
                                    cursor: 'pointer',
                                    borderColor:
                                        draft.uuid === activeUuid
                                            ? 'var(--mantine-color-green-6)'
                                            : undefined,
                                }}
                            >
                                <Group justify="space-between" wrap="nowrap">
                                    <Text size="sm" fw={600} truncate>
                                        {draft.slug}
                                    </Text>
                                    <Badge
                                        size="xs"
                                        color={statusColor[draft.status]}
                                        variant="light"
                                    >
                                        {statusLabel[draft.status]}
                                    </Badge>
                                </Group>
                                <Text size="xs" c="dimmed">
                                    {draft.authorName ?? 'Unknown author'} ·{' '}
                                    {new Date(draft.updatedAt).toLocaleString()}
                                </Text>
                            </Paper>
                        ))}
                        {drafts && drafts.length === 0 && (
                            <Text size="sm" c="dimmed">
                                No drafts yet — unpublished changes made by
                                editors will land here.
                            </Text>
                        )}
                    </Stack>
                </ScrollArea.Autosize>
            </Stack>

            <Stack style={{ flex: 1, minWidth: 0 }} gap="sm">
                {active && review ? (
                    <>
                        <Group justify="space-between">
                            <Stack gap={2}>
                                <Text fw={600}>{active.slug}</Text>
                                <Text size="xs" c="dimmed">
                                    Draft by {active.authorName ?? 'unknown'} ·
                                    published version on the left, their draft
                                    on the right
                                </Text>
                            </Stack>
                            <Group gap="xs">
                                {active.prUrl ? (
                                    <Button
                                        component="a"
                                        href={active.prUrl}
                                        target="_blank"
                                        variant="light"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconGitPullRequest}
                                            />
                                        }
                                    >
                                        View pull request
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            variant="default"
                                            leftSection={
                                                <MantineIcon icon={IconX} />
                                            }
                                            onClick={() => dismiss(active.uuid)}
                                        >
                                            Dismiss
                                        </Button>
                                        <Button
                                            loading={isWritingBack}
                                            leftSection={
                                                <MantineIcon
                                                    icon={IconGitPullRequest}
                                                />
                                            }
                                            onClick={() =>
                                                writeBack(active.uuid)
                                            }
                                        >
                                            Write back to repo
                                        </Button>
                                    </>
                                )}
                            </Group>
                        </Group>
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
                                        oldFile={{
                                            name: `lightdash/dashboards/${active.slug}.yml`,
                                            contents: review.publishedYaml,
                                        }}
                                        newFile={{
                                            name: `lightdash/dashboards/${active.slug}.yml`,
                                            contents: review.draftYaml,
                                        }}
                                        style={{ colorScheme }}
                                    />
                                </Virtualizer>
                            </Paper>
                        </WorkerPoolContextProvider>
                    </>
                ) : (
                    <Text c="dimmed" mt="xl" ta="center">
                        Select a draft to review
                    </Text>
                )}
            </Stack>
        </Group>
    );
};

export default ContentReviewPage;
