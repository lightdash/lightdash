import {
    type AiAgentReviewActivityEvent,
    type AiAgentReviewItemSummary,
    type AiAgentReviewRemediationEvent,
    type AiAgentReviewRemediationLiveState,
} from '@lightdash/common';
import { Anchor, Box } from '@mantine-8/core';
import dayjs from 'dayjs';
import { useMemo, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import { LightdashUserAvatar } from '../../../../../components/Avatar';
import { useOrgUsersByUuid } from '../../../../../hooks/useOrganizationUsers';
import { useAiAgentReviewItemActivity } from '../../hooks/useAiAgentAdmin';
import styles from './RemediationActivityTimeline.module.css';

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

const humanizeStatus = (status: string) => status.replaceAll('_', ' ');

const issueEventRow = (
    event: Extract<AiAgentReviewActivityEvent, { kind: 'issue' }>,
): Pick<TimelineRow, 'label' | 'meta' | 'tone'> => {
    switch (event.eventType) {
        case 'created':
            return { label: 'Issue opened', meta: null };
        case 'status_changed':
            return {
                label: `Status changed to ${humanizeStatus(event.payload.to)}`,
                meta: event.payload.from
                    ? `from ${humanizeStatus(event.payload.from)}`
                    : null,
            };
        case 'assignee_changed':
            return {
                label: event.payload.toUserUuid ? 'Assigned' : 'Unassigned',
                meta: null,
            };
        case 'recurred':
            return {
                label: 'Recurred — seen again',
                meta: null,
                tone: 'attention',
            };
        case 'priority_changed':
            return {
                label: 'Priority changed',
                meta: `${event.payload.from} → ${event.payload.to}`,
            };
        case 'comment_added':
            return {
                label: 'Comment added',
                meta: truncate(event.payload.body, 160),
            };
        default:
            return { label: 'Updated', meta: null };
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
                label: 'Finding opened',
                meta: (
                    <>
                        {event.payload.excerpt
                            ? `“${truncate(event.payload.excerpt)}”`
                            : null}
                        {event.payload.excerpt ? ' — from the ' : 'From the '}
                        {threadPath ? (
                            <Anchor
                                component={Link}
                                to={threadPath}
                                className={styles.metaLink}
                                inherit
                            >
                                source thread
                            </Anchor>
                        ) : (
                            'source thread'
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
                label: 'Writeback ran',
                meta: files ? `Edited ${files}${counts}` : null,
                tone: 'progress',
            };
        }
        case 'pr_opened':
            return {
                label: 'Pull request opened',
                tone: 'pr',
                meta: (
                    <Anchor
                        href={event.payload.prUrl}
                        target="_blank"
                        className={styles.metaLink}
                        inherit
                    >
                        {event.payload.prNumber
                            ? `View PR #${event.payload.prNumber}`
                            : 'View PR'}
                    </Anchor>
                ),
            };
        case 'pr_updated':
            return {
                label: 'Pull request updated',
                tone: 'pr',
                meta: event.payload.prUrl ? (
                    <Anchor
                        href={event.payload.prUrl}
                        target="_blank"
                        className={styles.metaLink}
                        inherit
                    >
                        View PR
                    </Anchor>
                ) : null,
            };
        case 'preview_compiled':
            return { label: 'Preview compiled', meta: null, tone: 'progress' };
        case 'verification_completed': {
            const threadPath = buildThreadPath(
                remediation?.previewProjectUuid ?? null,
                remediation?.previewAgentUuid ?? null,
                event.payload.previewThreadUuid,
            );
            return {
                label: 'Fix verified',
                tone: 'success',
                meta: threadPath ? (
                    <Anchor
                        component={Link}
                        to={threadPath}
                        className={styles.metaLink}
                        inherit
                    >
                        Open verification thread
                    </Anchor>
                ) : null,
            };
        }
        case 'pr_merged':
            return { label: 'Pull request merged', meta: null, tone: 'pr' };
        case 'pr_closed':
            return { label: 'Pull request closed', meta: null };
        case 'resolved':
            return { label: 'Resolved', meta: null, tone: 'success' };
        case 'failed':
            return {
                label: 'Failed',
                meta: event.payload.errorMessage,
                tone: 'danger',
            };
        case 'run_interrupted':
            return {
                label: 'Run interrupted by a deploy or restart',
                meta: event.payload.willRetry
                    ? 'Retrying automatically'
                    : 'Retry to run again',
                tone: 'danger',
            };
        default:
            return { label: 'Updated', meta: null };
    }
};

const liveRow = (
    liveState: AiAgentReviewRemediationLiveState,
    writebackProgress: string | null,
): TimelineRow => ({
    key: `live-${liveState}`,
    label:
        liveState === 'writeback'
            ? 'Writeback running'
            : liveState === 'compiling'
              ? 'Compiling preview'
              : 'Verifying fix',
    meta:
        liveState === 'writeback'
            ? (writebackProgress ?? 'Editing the dbt project…')
            : liveState === 'compiling'
              ? 'Building the preview project from the PR branch…'
              : 'Re-running the original question in the preview…',
    when: 'now',
    state: 'live',
    author: null,
});

type Props = {
    reviewItem: AiAgentReviewItemSummary;
};

export const RemediationActivityTimeline: FC<Props> = ({ reviewItem }) => {
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
                    ? issueEventRow(event)
                    : eventRow(event, reviewItem);
            return {
                key: event.uuid,
                when,
                state: 'done' as const,
                author: authorNode(event.createdByUserUuid),
                ...base,
            };
        });
        return data.liveState
            ? [...eventRows, liveRow(data.liveState, data.liveMessage)]
            : eventRows;
    }, [data, reviewItem, usersByUuid]);

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
