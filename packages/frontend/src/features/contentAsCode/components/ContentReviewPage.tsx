import { type ContentDraftSummary } from '@lightdash/common';
import {
    Anchor,
    Avatar,
    Badge,
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
    IconEyeCheck,
    IconExternalLink,
    IconGitPullRequest,
    IconLayoutDashboard,
    IconX,
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

const statusMeta: Record<
    ContentDraftSummary['status'],
    { color: string; label: string }
> = {
    open: { color: 'yellow', label: 'Awaiting review' },
    written_back: { color: 'green', label: 'PR opened' },
    dismissed: { color: 'gray', label: 'Dismissed' },
};

const DraftRow: FC<{
    draft: ContentDraftSummary;
    isActive: boolean;
    onSelect: () => void;
}> = ({ draft, isActive, onSelect }) => (
    <UnstyledButton onClick={onSelect} w="100%">
        <Paper
            withBorder
            p="xs"
            radius="md"
            style={{
                borderColor: isActive
                    ? 'var(--mantine-color-green-6)'
                    : undefined,
                backgroundColor: isActive
                    ? 'var(--mantine-color-green-0)'
                    : undefined,
                opacity: draft.status === 'dismissed' ? 0.6 : 1,
            }}
        >
            <Group gap="sm" wrap="nowrap">
                <Avatar size="sm" radius="xl" color="green" variant="light">
                    {initials(draft.authorName)}
                </Avatar>
                <Stack gap={2} style={{ flex: 1, minWidth: 0 }}>
                    <Group gap={6} wrap="nowrap">
                        <MantineIcon
                            icon={IconLayoutDashboard}
                            size="sm"
                            color="gray.6"
                        />
                        <Text size="sm" fw={600} truncate>
                            {draft.slug}
                        </Text>
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                        {draft.authorName ?? 'Unknown author'} ·{' '}
                        {timeAgo(draft.updatedAt)}
                    </Text>
                </Stack>
                <Badge
                    size="xs"
                    variant="dot"
                    tt="none"
                    fw={500}
                    color={statusMeta[draft.status].color}
                    style={{ flexShrink: 0 }}
                >
                    {statusMeta[draft.status].label}
                </Badge>
            </Group>
        </Paper>
    </UnstyledButton>
);

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
    const { data: review } = useContentDraftReview(projectUuid, activeUuid);
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
                        color="green"
                    >
                        <MantineIcon icon={IconEyeCheck} size="lg" />
                    </ThemeIcon>
                    <Text fw={600}>All clear</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={360}>
                        When editors save unpublished changes to managed
                        dashboards, their drafts land here for you to review and
                        write back to the repo.
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Group align="flex-start" gap="lg" wrap="nowrap">
            <Stack w={310} gap="sm" style={{ flexShrink: 0 }}>
                <ScrollArea.Autosize mah="72vh">
                    <Stack gap="lg">
                        {openDrafts.length > 0 && (
                            <Stack gap="xs">
                                <Group gap={6}>
                                    <Text
                                        size="xs"
                                        fw={600}
                                        tt="uppercase"
                                        c="dimmed"
                                        style={{ letterSpacing: '0.05em' }}
                                    >
                                        Awaiting review
                                    </Text>
                                    <Badge
                                        size="xs"
                                        variant="filled"
                                        color="yellow"
                                        circle
                                    >
                                        {openDrafts.length}
                                    </Badge>
                                </Group>
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
                            <Stack gap="xs">
                                <Text
                                    size="xs"
                                    fw={600}
                                    tt="uppercase"
                                    c="dimmed"
                                    style={{ letterSpacing: '0.05em' }}
                                >
                                    History
                                </Text>
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

            <Stack style={{ flex: 1, minWidth: 0 }} gap="sm">
                {active && review ? (
                    <>
                        <Group justify="space-between" align="flex-start">
                            <Stack gap={4}>
                                <Group gap="xs">
                                    <MantineIcon
                                        icon={IconLayoutDashboard}
                                        size="lg"
                                        color="gray.6"
                                    />
                                    <Text fw={700} size="lg">
                                        {active.slug}
                                    </Text>
                                    {stats && (
                                        <Group gap={4}>
                                            <Text
                                                size="xs"
                                                fw={600}
                                                c="green.8"
                                                ff="monospace"
                                            >
                                                +{stats.added}
                                            </Text>
                                            <Text
                                                size="xs"
                                                fw={600}
                                                c="red.7"
                                                ff="monospace"
                                            >
                                                −{stats.removed}
                                            </Text>
                                        </Group>
                                    )}
                                </Group>
                                <Group gap={6}>
                                    <Avatar
                                        size={18}
                                        radius="xl"
                                        color="green"
                                        variant="light"
                                    >
                                        <Text size="8px">
                                            {initials(active.authorName)}
                                        </Text>
                                    </Avatar>
                                    <Text size="xs" c="dimmed">
                                        Draft by{' '}
                                        {active.authorName ?? 'unknown'} ·
                                        updated {timeAgo(active.updatedAt)}
                                    </Text>
                                    <Anchor
                                        component={Link}
                                        to={`/projects/${projectUuid}/dashboards/${active.contentUuid}/view`}
                                        size="xs"
                                    >
                                        <Group gap={2} display="inline-flex">
                                            Open dashboard
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size="sm"
                                            />
                                        </Group>
                                    </Anchor>
                                </Group>
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
                                ) : active.status === 'open' ? (
                                    <>
                                        <Popover
                                            opened={confirmingDismiss}
                                            onChange={setConfirmingDismiss}
                                            position="bottom-end"
                                            withArrow
                                        >
                                            <Popover.Target>
                                                <Button
                                                    variant="default"
                                                    leftSection={
                                                        <MantineIcon
                                                            icon={IconX}
                                                        />
                                                    }
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
                                                        color="red"
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
                                            label="Opens (or appends to) this dashboard's pull request with the draft's content"
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
                    <Box mt="xl">
                        <Text c="dimmed" ta="center">
                            Select a draft to review
                        </Text>
                    </Box>
                )}
            </Stack>
        </Group>
    );
};

export default ContentReviewPage;
