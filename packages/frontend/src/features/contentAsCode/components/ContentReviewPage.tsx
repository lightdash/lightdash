import {
    assertUnreachable,
    type ApiError,
    type ContentDraftSummary,
} from '@lightdash/common';
import {
    Anchor,
    Badge,
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
import { type TFunction } from 'i18next';
import { useMemo, useState, type CSSProperties, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    PIERRE_HIGHLIGHTER_OPTIONS,
    PIERRE_POOL_OPTIONS,
} from '../../../ee/features/aiCopilot/components/Admin/pierreDiffConfig';
import {
    useContentDraftReview,
    useDraftStaleness,
    useContentDrafts,
    useDismissDraftMutation,
    useWriteBackDraftMutation,
} from '../hooks/useContentDrafts';
import { draftFieldLabel } from '../utils/draftFieldLabel';
import classes from './ContentReviewPage.module.css';
import staleClasses from './DraftStalePanel.module.css';

const timeAgo = (t: TFunction, date: Date | string): string => {
    const seconds = Math.max(
        0,
        Math.round((Date.now() - new Date(date).getTime()) / 1000),
    );
    if (seconds < 60) return t('review.timeAgo.justNow');
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return t('review.timeAgo.minutes', { count: minutes });
    const hours = Math.round(minutes / 60);
    if (hours < 24) return t('review.timeAgo.hours', { count: hours });
    const days = Math.round(hours / 24);
    if (days < 7) return t('review.timeAgo.days', { count: days });
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
    t: TFunction,
    status: ContentDraftSummary['writebackStatus'],
): string => {
    switch (status) {
        case 'merged':
            return t('review.writeback.merged');
        case 'closed':
            return t('review.writeback.closed');
        case 'error':
            return t('review.writeback.error');
        case 'pending':
        case 'open':
        case null:
            return t('review.writeback.opened');
        default:
            return assertUnreachable(
                status,
                `Unknown write-back status ${status}`,
            );
    }
};

const rowMeta = (t: TFunction, draft: ContentDraftSummary): string => {
    const author = draft.authorName ?? t('review.unknownAuthor');
    const when = timeAgo(t, draft.updatedAt);
    switch (draft.status) {
        case 'written_back':
            return t('review.rowMetaWrittenBack', {
                status: writebackLabel(t, draft.writebackStatus),
                author,
                when,
            });
        case 'dismissed':
            return t('review.rowMetaDismissed', { author, when });
        case 'open':
        default:
            return t('review.rowMeta', { author, when });
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
}> = ({ draft, isActive, onSelect }) => {
    const { t } = useTranslation('contentAsCode');
    return (
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
                <Stack gap={1} flex={1} miw={0}>
                    <Group gap={6} wrap="nowrap">
                        <Text size="sm" fw={isActive ? 600 : 500} truncate>
                            {draft.slug}
                        </Text>
                        {draft.stale ? (
                            <Badge size="xs" color="yellow">
                                {t('review.behindRepoBadge')}
                            </Badge>
                        ) : null}
                    </Group>
                    <Text size="xs" c="dimmed" truncate>
                        {rowMeta(t, draft)}
                    </Text>
                </Stack>
            </Group>
        </UnstyledButton>
    );
};

const ReviewPlaceholder: FC<{
    active: ContentDraftSummary | undefined;
    error: ApiError | null;
    onDismiss: (draftUuid: string) => void;
}> = ({ active, error, onDismiss }) => {
    const { t } = useTranslation('contentAsCode');
    if (!active || !error) {
        return (
            <Box mt="xl">
                <Text c="dimmed" ta="center">
                    {t('review.selectDraft')}
                </Text>
            </Box>
        );
    }
    const title =
        error.error.statusCode === 404
            ? t('review.contentMissing', { context: active.contentType })
            : t('review.loadFailed');
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
                    {t('review.dismissDraft')}
                </Button>
            ) : null}
        </Stack>
    );
};

type ContentReviewPageProps = {
    projectUuid: string | undefined;
};

const ContentReviewPage: FC<ContentReviewPageProps> = ({ projectUuid }) => {
    const { t } = useTranslation('contentAsCode');
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
    const { data: stalenessDetails } = useDraftStaleness(
        projectUuid,
        review?.staleness ? activeUuid : undefined,
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
                    <Text fw={600}>{t('review.allClear')}</Text>
                    <Text size="sm" c="dimmed" ta="center" maw={360}>
                        {t('review.emptyDescription')}
                    </Text>
                </Stack>
            </Center>
        );
    }

    return (
        <Group align="flex-start" gap="md" wrap="nowrap">
            <Stack w={280} gap="sm" flex="0 0 auto">
                <ScrollArea.Autosize mah="72vh">
                    <Stack gap="md">
                        {openDrafts.length > 0 && (
                            <Stack gap={4}>
                                <SectionLabel
                                    label={t('review.awaitingReview')}
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
                                <SectionLabel label={t('review.history')} />
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

            <Stack flex={1} miw={0} gap="xs">
                {active && review ? (
                    <>
                        <Group
                            justify="space-between"
                            align="flex-start"
                            wrap="nowrap"
                        >
                            <Stack gap={2} miw={0}>
                                <Text fw={600} size="lg">
                                    {active.slug}
                                </Text>
                                <Group gap={6}>
                                    <Text size="xs" c="dimmed">
                                        {t('review.draftBy', {
                                            author:
                                                active.authorName ??
                                                t('review.unknown'),
                                            when: timeAgo(t, active.updatedAt),
                                        })}
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
                                            {t('review.open', {
                                                context: active.contentType,
                                            })}
                                            <MantineIcon
                                                icon={IconExternalLink}
                                                size="sm"
                                            />
                                        </Group>
                                    </Anchor>
                                </Group>
                            </Stack>
                            <Group gap="xs" wrap="nowrap" flex="0 0 auto">
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
                                        {t('review.viewPullRequest')}
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
                                                    {t('review.dismiss')}
                                                </Button>
                                            </Popover.Target>
                                            <Popover.Dropdown>
                                                <Stack gap="xs">
                                                    <Text size="sm" maw={220}>
                                                        {t(
                                                            'review.dismissConfirm',
                                                        )}
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
                                                        {t(
                                                            'review.dismissDraft',
                                                        )}
                                                    </Button>
                                                </Stack>
                                            </Popover.Dropdown>
                                        </Popover>
                                        <Tooltip
                                            label={
                                                review.staleness
                                                    ? t('review.staleTooltip', {
                                                          fields: review.staleness.changedFields
                                                              .map((field) =>
                                                                  draftFieldLabel(
                                                                      field,
                                                                      true,
                                                                  ),
                                                              )
                                                              .join(', '),
                                                      })
                                                    : t(
                                                          'review.writeBackTooltip',
                                                          {
                                                              context:
                                                                  active.contentType,
                                                          },
                                                      )
                                            }
                                            w={300}
                                        >
                                            <Button
                                                loading={isWritingBack}
                                                disabled={
                                                    review.staleness !== null
                                                }
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
                                                {t('review.writeBack')}
                                            </Button>
                                        </Tooltip>
                                    </>
                                ) : null}
                            </Group>
                        </Group>
                        {review.staleness ? (
                            <Box className={staleClasses.panel}>
                                <Stack gap={4}>
                                    <Group gap={8} wrap="nowrap">
                                        <span className={staleClasses.dot} />
                                        <Text size="sm" fw={600}>
                                            {t('review.behindTitle')}
                                        </Text>
                                    </Group>
                                    <Text size="sm" c="dimmed">
                                        {t('review.behindDescription')}
                                    </Text>
                                    {(stalenessDetails?.changes ?? []).map(
                                        (change) => (
                                            <Text size="sm" key={change.field}>
                                                <Text span fw={500}>
                                                    {draftFieldLabel(
                                                        change.field,
                                                    )}
                                                </Text>
                                                {t('review.changeRepo', {
                                                    change: change.repo,
                                                })}
                                                {change.mine
                                                    ? t('review.changeMine', {
                                                          change: change.mine,
                                                      })
                                                    : ''}
                                            </Text>
                                        ),
                                    )}
                                </Stack>
                            </Box>
                        ) : null}
                        <WorkerPoolContextProvider
                            poolOptions={PIERRE_POOL_OPTIONS}
                            highlighterOptions={PIERRE_HIGHLIGHTER_OPTIONS}
                        >
                            <Paper radius="md" className={classes.diffPanel}>
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
