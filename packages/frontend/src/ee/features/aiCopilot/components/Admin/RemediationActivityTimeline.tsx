import {
    type AiAgentReviewActivityEvent,
    type AiAgentReviewItemSummary,
    type AiAgentReviewRemediationEvent,
    type AiAgentReviewRemediationLiveState,
} from '@lightdash/common';
import { Anchor, Box } from '@mantine/core';
import dayjs from 'dayjs';
import { type TFunction } from 'i18next';
import { useMemo, type FC, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import { useOrgUsersByUuid } from '../../../../../hooks/useOrganizationUsers';
import { useAiAgentReviewItemActivity } from '../../hooks/useAiAgentAdmin';
import styles from './RemediationActivityTimeline.module.css';
import { reviewPriorityLabels } from './reviewItemDetails';

const LIVE_POLL_INTERVAL_MS = 5_000;
// Writeback streams step messages, so poll faster while it runs.
const WRITEBACK_POLL_INTERVAL_MS = 2_500;

const formatWhen = (occurredAt: Date | string, previous: Date | null) => {
    const date = dayjs(occurredAt);
    // First event (or a new day) carries the day; same-day follow-ups are
    // time-only, so the column stays quiet.
    if (previous && date.isSame(previous, 'day')) {
        return date.format('HH:mm');
    }
    return date.format('ddd HH:mm');
};

const truncate = (text: string, max = 90) =>
    text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;

// Tones color the timeline node by what the event means: teal for fix
// progress, indigo for PR motion, green for verified/resolved, red for
// failures, orange for recurrences. Neutral events stay gray.
type TimelineTone = 'progress' | 'pr' | 'success' | 'danger' | 'attention';

type TimelineRow = {
    key: string;
    label: string;
    meta: ReactNode;
    when: string;
    state: 'done' | 'live';
    author: ReactNode;
    tone?: TimelineTone;
};

const issueEventRow = (
    event: Extract<AiAgentReviewActivityEvent, { kind: 'issue' }>,
    t: TFunction,
): Pick<TimelineRow, 'label' | 'meta' | 'tone'> => {
    switch (event.eventType) {
        case 'created':
            return { label: t('timeline.issueOpened'), meta: null };
        case 'status_changed':
            return {
                label: t('timeline.statusChanged', {
                    status: t(`threadsTable.reviewStatus.${event.payload.to}`),
                }),
                meta: event.payload.from
                    ? t('timeline.statusFrom', {
                          status: t(
                              `threadsTable.reviewStatus.${event.payload.from}`,
                          ),
                      })
                    : null,
            };
        case 'assignee_changed':
            return {
                label: event.payload.toUserUuid
                    ? t('timeline.assigned')
                    : t('timeline.unassigned'),
                meta: null,
            };
        case 'recurred':
            return {
                label: t('timeline.recurred'),
                meta: null,
                tone: 'attention',
            };
        case 'priority_changed':
            return {
                label: t('timeline.priorityChanged'),
                meta: `${reviewPriorityLabels[event.payload.from]} → ${reviewPriorityLabels[event.payload.to]}`,
            };
        case 'comment_added':
            return {
                label: t('timeline.commentAdded'),
                meta: truncate(event.payload.body, 160),
            };
        default:
            return { label: t('timeline.updated'), meta: null };
    }
};

const buildThreadPath = (
    projectUuid: string | null,
    agentUuid: string | null,
    threadUuid: string,
) =>
    projectUuid && agentUuid
        ? `/projects/${projectUuid}/ai-agents/${agentUuid}/threads/${threadUuid}`
        : null;

const eventRow = (
    event: AiAgentReviewRemediationEvent,
    reviewItem: AiAgentReviewItemSummary,
    t: TFunction,
): Pick<TimelineRow, 'label' | 'meta' | 'tone'> => {
    const remediation = reviewItem.remediation;
    switch (event.eventType) {
        case 'finding_opened': {
            const threadPath = event.payload.sourceThreadUuid
                ? buildThreadPath(
                      reviewItem.projectUuid,
                      reviewItem.agentUuid,
                      event.payload.sourceThreadUuid,
                  )
                : null;
            return {
                label: t('timeline.findingOpened'),
                meta: (
                    <>
                        {event.payload.excerpt
                            ? t('timeline.quotedExcerpt', {
                                  excerpt: truncate(event.payload.excerpt),
                              })
                            : null}
                        {event.payload.excerpt
                            ? t('timeline.fromThe')
                            : t('timeline.fromTheStart')}
                        {threadPath ? (
                            <Anchor
                                component={Link}
                                to={threadPath}
                                className={styles.metaLink}
                                inherit
                            >
                                {t('timeline.sourceThread')}
                            </Anchor>
                        ) : (
                            t('timeline.sourceThread')
                        )}
                    </>
                ),
            };
        }
        case 'writeback_completed': {
            const files = event.payload.files.join(', ');
            const counts =
                event.payload.additions !== null ||
                event.payload.deletions !== null
                    ? ` · +${event.payload.additions ?? 0} −${
                          event.payload.deletions ?? 0
                      }`
                    : '';
            return {
                label: t('timeline.writebackRan'),
                meta: files ? t('timeline.edited', { files, counts }) : null,
                tone: 'progress',
            };
        }
        case 'pr_opened':
            return {
                label: t('timeline.prOpened'),
                tone: 'pr',
                meta: (
                    <Anchor
                        href={event.payload.prUrl}
                        target="_blank"
                        className={styles.metaLink}
                        inherit
                    >
                        {event.payload.prNumber
                            ? t('timeline.viewPrNumber', {
                                  number: event.payload.prNumber,
                              })
                            : t('timeline.viewPr')}
                    </Anchor>
                ),
            };
        case 'pr_updated':
            return {
                label: t('timeline.prUpdated'),
                tone: 'pr',
                meta: event.payload.prUrl ? (
                    <Anchor
                        href={event.payload.prUrl}
                        target="_blank"
                        className={styles.metaLink}
                        inherit
                    >
                        {t('timeline.viewPr')}
                    </Anchor>
                ) : null,
            };
        case 'preview_compiled':
            return {
                label: t('timeline.previewCompiled'),
                meta: null,
                tone: 'progress',
            };
        case 'verification_completed': {
            const threadPath = buildThreadPath(
                remediation?.previewProjectUuid ?? null,
                remediation?.previewAgentUuid ?? null,
                event.payload.previewThreadUuid,
            );
            return {
                label: t('timeline.fixVerified'),
                tone: 'success',
                meta: threadPath ? (
                    <Anchor
                        component={Link}
                        to={threadPath}
                        className={styles.metaLink}
                        inherit
                    >
                        {t('timeline.openVerificationThread')}
                    </Anchor>
                ) : null,
            };
        }
        case 'pr_merged':
            return { label: t('timeline.prMerged'), meta: null, tone: 'pr' };
        case 'pr_closed':
            return { label: t('timeline.prClosed'), meta: null };
        case 'resolved':
            return {
                label: t('timeline.resolved'),
                meta: null,
                tone: 'success',
            };
        case 'failed':
            return {
                label: t('timeline.failed'),
                meta: event.payload.errorMessage,
                tone: 'danger',
            };
        default:
            return { label: t('timeline.updated'), meta: null };
    }
};

const liveRow = (
    liveState: AiAgentReviewRemediationLiveState,
    writebackProgress: string | null,
    t: TFunction,
): TimelineRow => ({
    key: `live-${liveState}`,
    label:
        liveState === 'writeback'
            ? t('timeline.live.writeback')
            : liveState === 'compiling'
              ? t('timeline.live.compiling')
              : t('timeline.live.verifying'),
    meta:
        liveState === 'writeback'
            ? (writebackProgress ?? t('timeline.live.writebackMeta'))
            : liveState === 'compiling'
              ? t('timeline.live.compilingMeta')
              : t('timeline.live.verifyingMeta'),
    when: t('timeline.live.now'),
    state: 'live',
    author: null,
});

type Props = {
    reviewItem: AiAgentReviewItemSummary;
};

export const RemediationActivityTimeline: FC<Props> = ({ reviewItem }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const usersByUuid = useOrgUsersByUuid();
    const { data } = useAiAgentReviewItemActivity(reviewItem.fingerprint, {
        // Poll only while a step is in flight — settled feeds are static.
        refetchInterval: (latest) =>
            latest?.liveState === 'writeback'
                ? WRITEBACK_POLL_INTERVAL_MS
                : latest?.liveState
                  ? LIVE_POLL_INTERVAL_MS
                  : false,
    });

    const rows = useMemo<TimelineRow[]>(() => {
        if (!data || data.events.length === 0) {
            return [];
        }
        const authorNode = (userUuid: string | null): ReactNode => {
            if (!userUuid) return null;
            const user = usersByUuid.get(userUuid);
            if (!user) return null;
            const name =
                `${user.firstName} ${user.lastName}`.trim() || user.email;
            return (
                <span className={styles.author}>
                    <LightdashUserAvatar size="xs" radius="xl" name={name} />
                    {name}
                </span>
            );
        };
        let previous: Date | null = null;
        const eventRows = data.events.map((event) => {
            const when = formatWhen(event.occurredAt, previous);
            previous = dayjs(event.occurredAt).toDate();
            const base =
                event.kind === 'issue'
                    ? issueEventRow(event, t)
                    : eventRow(event, reviewItem, t);
            return {
                key: event.uuid,
                when,
                state: 'done' as const,
                author: authorNode(event.createdByUserUuid),
                ...base,
            };
        });
        return data.liveState
            ? [...eventRows, liveRow(data.liveState, data.liveMessage, t)]
            : eventRows;
    }, [data, reviewItem, usersByUuid, t]);

    if (rows.length === 0) {
        return null;
    }

    return (
        <Box component="ul" className={styles.timeline}>
            {rows.map((row) => (
                <li
                    key={row.key}
                    className={styles.item}
                    data-done={row.state === 'done' || undefined}
                    data-live={row.state === 'live' || undefined}
                    data-tone={row.tone}
                >
                    <span className={styles.when}>{row.when}</span>
                    <div className={styles.node} />
                    <div className={styles.event}>
                        {row.label}
                        {row.author}
                    </div>
                    {row.meta ? (
                        <div className={styles.meta}>{row.meta}</div>
                    ) : null}
                </li>
            ))}
        </Box>
    );
};
