import {
    assertUnreachable,
    type ApiError,
    type ContentDraftSummary,
} from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Box,
    Button,
    Center,
    Divider,
    Group,
    Paper,
    Popover,
    ScrollArea,
    Stack,
    Text,
    ThemeIcon,
    Tooltip,
    UnstyledButton,
    useComputedColorScheme,
} from '@mantine/core';
import {
    MultiFileDiff,
    Virtualizer,
    WorkerPoolContextProvider,
} from '@pierre/diffs/react';
import {
    IconExternalLink,
    IconEyeCheck,
    IconGitPullRequest,
} from '@tabler/icons-react';
import { useMemo, useState, type CSSProperties, type FC } from 'react';
import { Link } from 'react-router';
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
import classes from './ContentReviewPage.module.css';

const timeAgo = (date: Date | string): string => {
    const seconds = Math.max(
        0,
        Math.round((Date.now() - new Date(date).getTime()) / 1000),
    );
    if (seconds < 60) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(date).toLocaleDateString();
};

const initials = (name: string | null): string =>
    (name ?? '?')
        .split(' ')
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join('')
        .toUpperCase();

// Cheap +/- counts: lines that only appear on one side
const changeStats = (
    publishedYaml: string,
    draftYaml: string,
): { added: number; removed: number } => {
    const count = (lines: string[]) => {
        const map = new Map<string, number>();
        lines.forEach((line) => map.set(line, (map.get(line) ?? 0) + 1));
        return map;
    };
    const published = count(publishedYaml.split('\n'));
    const draft = count(draftYaml.split('\n'));
    let added = 0;
    let removed = 0;
    draft.forEach((n, line) => {
        added += Math.max(0, n - (published.get(line) ?? 0));
    });
    published.forEach((n, line) => {
        removed += Math.max(0, n - (draft.get(line) ?? 0));
    });
    return { added, removed };
};

const writebackLabel = (
    status: ContentDraftSummary['writebackStatus'],
): string => {
    switch (status) {
        case 'merged':
            return 'PR merged';
        case 'closed':
            return 'PR closed';
        case 'error':
            return 'Write-back failed';
        case 'pending':
        case 'open':
        case null:
            return 'PR opened';
        default:
            return assertUnreachable(
                status,
                `Unknown write-back status ${status}`,
            );
    }
};

const rowMeta = (draft: ContentDraftSummary): string => {
    const author = draft.authorName ?? 'Unknown author';
    const when = timeAgo(draft.updatedAt);
    switch (draft.status) {
        case 'written_back':
            return `${writebackLabel(draft.writebackStatus)} · ${author} · ${when}`;
        case 'dismissed':
            return `Dismissed · ${author} · ${when}`;
        case 'open':
        default:
            return `${author} · ${when}`;
    }
};

const SectionLabel: FC<{ label: string; count?: number }> = ({
    label,
    count,
}) => (
    <Text size="xs" c="dimmed" px={8}>
        {label}
        {count !== undefined ? ` · ${count}` : ''}
    </Text>
);

const DraftRow: FC<{
    draft: ContentDraftSummary;
    isActive: boolean;
    onSelect: () => void;
}> = ({ draft, isActive, onSelect }) => (
    <UnstyledButton
        onClick={onSelect}
        className={classes.row}
        data-active={isActive}
    >
        <Group gap="sm" wrap="nowrap">
            <Avatar size={26} radius="xl" color="gray" variant="light">
                <Text size="10px" fw={600}>
                    {initials(draft.authorName)}
                </Text>
            </Avatar>
            <Stack gap={1} style={{ flex: 1, minWidth: 0 }}>
                <Text size="sm" fw={isActive ? 600 : 500} truncate>
                    {draft.slug}
                </Text>
                <Text size="xs" c="dimmed" truncate>
                    {rowMeta(draft)}
                </Text>
            </Stack>
        </Group>
    </UnstyledButton>
);

const ReviewPlaceholder: FC<{
    active: ContentDraftSummary | undefined;
    error: ApiError | null;
    onDismiss: (draftUuid: string) => void;
}> = ({ active, error, onDismiss }) => {
    if (!active || !error) {
        return (
            <Box mt="xl">
                <Text c="dimmed" ta="center">
                    Select a draft to review
                </Text>
            </Box>
        );
    }
    const title =
        error.error.statusCode === 404
            ? `This draft's ${active.contentType} no longer exists.`
            : "This draft couldn't be loaded.";
    return (
        <Stack mt="xl" gap={4} align="center">
            <Text ta="center">{title}</Text>
            {error.error.message ? (
                <Text size="sm" c="dimmed" ta="center">
                    {error.error.message}
                </Text>
            ) : null}
            {active.status === 'open' ? (
                <Button
                    mt="xs"
                    size="xs"
                    variant="default"
                    onClick={() => onDismiss(active.uuid)}
                >
                    Dismiss draft
                </Button>
            ) : null}
        </Stack>
    );
};

type ContentReviewPageProps = {
    projectUuid: string | undefined;
};

const ContentReviewPage: FC<ContentReviewPageProps> = ({ projectUuid }) => {
    const colorScheme = useComputedColorScheme('light');
    const { data: drafts } = useContentDrafts(projectUuid);
    const [selectedUuid, setSelectedUuid] = useState<string | undefined>();
    const openDrafts = useMemo(
        () => (drafts ?? []).filter((draft) => draft.status === 'open'),
        [drafts],
    );
    const historyDrafts = useMemo(
        () => (drafts ?? []).filter((draft) => draft.status !== 'open'),
        [drafts],
    );
    const activeUuid =
        selectedUuid ?? openDrafts[0]?.uuid ?? historyDrafts[0]?.uuid;
    const { data: review, error: reviewError } = useContentDraftReview(
        projectUuid,
        activeUuid,
    );
    const { mutate: writeBack, isLoading: isWritingBack } =
        useWriteBackDraftMutation(projectUuid);
    const { mutate: dismiss } = useDismissDraftMutation(projectUuid);
    const [confirmingDismiss, setConfirmingDismiss] = useState(false);

    const active = drafts?.find((draft) => draft.uuid === activeUuid);
    const stats = useMemo(
        () =>
            review
                ? changeStats(review.publishedYaml, review.draftYaml)
                : undefined,
        [review],
    );

    // Pierre's <Virtualizer> IS the scroll viewport its virtualizer tracks
    const viewportStyle = {
        maxHeight: '62vh',
        overflow: 'auto',
        colorScheme,
        '--diffs-font-size': '11px',
        '--diffs-line-height': '17px',
    } as CSSProperties;

    if (drafts && drafts.length === 0) {
        return (
            <Center mih={280}>
                <Stack align="center" gap="xs">
                    <ThemeIcon
                        size={44}
                        radius="xl"
                        variant="light"
                        color="gray"
                    >
                        <MantineIcon icon={IconEyeCheck} size="lg" />
                    </ThemeIcon>
                    <Text fw={600}>All clear</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={360}>
                        When editors save unpublished changes to managed charts
                        or dashboards, their drafts land here for you to review
                        and write back to the repo.
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Group align="flex-start" gap="md" wrap="nowrap">
            <Stack w={280} gap="sm" style={{ flexShrink: 0 }}>
                <ScrollArea.Autosize mah="72vh">
                    <Stack gap="md">
                        {openDrafts.length > 0 && (
                            <Stack gap={4}>
                                <SectionLabel
                                    label="Awaiting review"
                                    count={openDrafts.length}
                                />
                                {openDrafts.map((draft) => (
                                    <DraftRow
                                        key={draft.uuid}
                                        draft={draft}
                                        isActive={draft.uuid === activeUuid}
                                        onSelect={() =>
                                            setSelectedUuid(draft.uuid)
                                        }
                                    />
                                ))}
                            </Stack>
                        )}
                        {historyDrafts.length > 0 && (
                            <Stack gap={4}>
                                <SectionLabel label="History" />
                                {historyDrafts.map((draft) => (
                                    <DraftRow
                                        key={draft.uuid}
                                        draft={draft}
                                        isActive={draft.uuid === activeUuid}
                                        onSelect={() =>
                                            setSelectedUuid(draft.uuid)
                                        }
                                    />
                                ))}
                            </Stack>
                        )}
                    </Stack>
                </ScrollArea.Autosize>
            </Stack>

            <Divider orientation="vertical" />

            <Stack style={{ flex: 1, minWidth: 0 }} gap="xs">
                {active && review ? (
                    <>
                        <Group
                            justify="space-between"
                            align="flex-start"
                            wrap="nowrap"
                        >
                            <Stack gap={2} style={{ minWidth: 0 }}>
                                <Text fw={600} size="lg">
                                    {active.slug}
                                </Text>
                                <Group gap={6}>
                                    <Text size="xs" c="dimmed">
                                        Draft by{' '}
                                        {active.authorName ?? 'unknown'} ·
                                        updated {timeAgo(active.updatedAt)}
                                        {stats
                                            ? ` · +${stats.added} −${stats.removed}`
                                            : ''}
                                    </Text>
                                    <Anchor
                                        component={Link}
                                        to={
                                            active.contentType === 'chart'
                                                ? `/projects/${projectUuid}/saved/${active.contentUuid}/view`
                                                : `/projects/${projectUuid}/dashboards/${active.contentUuid}/view`
                                        }
                                        size="xs"
                                        c="dimmed"
                                        underline="always"
                                    >
                                        <Group gap={2} display="inline-flex">
                                            Open {active.contentType}
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size="sm"
                                            />
                                        </Group>
                                    </Anchor>
                                </Group>
                            </Stack>
                            <Group
                                gap="xs"
                                wrap="nowrap"
                                style={{ flexShrink: 0 }}
                            >
                                {active.prUrl ? (
                                    <Button
                                        component="a"
                                        href={active.prUrl}
                                        target="_blank"
                                        variant="default"
                                        leftSection={
                                            <MantineIcon
                                                icon={IconGitPullRequest}
                                            />
                                        }
                                    >
                                        View pull request
                                    </Button>
                                ) : active.status === 'open' ? (
                                    <>
                                        <Popover
                                            opened={confirmingDismiss}
                                            onChange={setConfirmingDismiss}
                                            position="bottom-end"
                                        >
                                            <Popover.Target>
                                                <Button
                                                    variant="subtle"
                                                    color="gray"
                                                    onClick={() =>
                                                        setConfirmingDismiss(
                                                            true,
                                                        )
                                                    }
                                                >
                                                    Dismiss
                                                </Button>
                                            </Popover.Target>
                                            <Popover.Dropdown>
                                                <Stack gap="xs">
                                                    <Text size="sm" maw={220}>
                                                        Dismiss this draft? The
                                                        author's changes stay
                                                        unpublished and won't
                                                        reach the repo.
                                                    </Text>
                                                    <Button
                                                        size="xs"
                                                        variant="default"
                                                        onClick={() => {
                                                            dismiss(
                                                                active.uuid,
                                                            );
                                                            setConfirmingDismiss(
                                                                false,
                                                            );
                                                        }}
                                                    >
                                                        Dismiss draft
                                                    </Button>
                                                </Stack>
                                            </Popover.Dropdown>
                                        </Popover>
                                        <Tooltip
                                            label={`Opens this ${active.contentType}'s pull request with the draft's content`}
                                            withinPortal
                                        >
                                            <Button
                                                loading={isWritingBack}
                                                leftSection={
                                                    <MantineIcon
                                                        icon={
                                                            IconGitPullRequest
                                                        }
                                                    />
                                                }
                                                onClick={() =>
                                                    writeBack(active.uuid)
                                                }
                                            >
                                                Write back to repo
                                            </Button>
                                        </Tooltip>
                                    </>
                                ) : null}
                            </Group>
                        </Group>
                        <WorkerPoolContextProvider
                            poolOptions={PIERRE_POOL_OPTIONS}
                            highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                        >
                            <Paper
                                withBorder
                                radius="md"
                                style={{ overflow: 'hidden' }}
                            >
                                <Virtualizer
                                    key={active.uuid}
                                    style={viewportStyle}
                                >
                                    <MultiFileDiff
                                        oldFile={{
                                            name: review.filePath,
                                            contents: review.publishedYaml,
                                        }}
                                        newFile={{
                                            name: review.filePath,
                                            contents: review.draftYaml,
                                        }}
                                        style={{ colorScheme }}
                                    />
                                </Virtualizer>
                            </Paper>
                        </WorkerPoolContextProvider>
                    </>
                ) : (
                    <ReviewPlaceholder
                        active={active}
                        error={reviewError}
                        onDismiss={dismiss}
                    />
                )}
            </Stack>
        </Group>
    );
};

export default ContentReviewPage;
