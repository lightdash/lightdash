import {
    type AiAgentReviewItemSummary,
    type AiAgentReviewRemediationEvent,
    type AiAgentReviewRemediationLiveState,
} from '@lightdash/common';
import { Anchor, Box } from '@mantine-8/core';
import dayjs from 'dayjs';
import { useMemo, type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
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

type TimelineRow = {
    key: string;
    label: string;
    meta: ReactNode;
    when: string;
    state: 'done' | 'live';
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
): Pick<TimelineRow, 'label' | 'meta'> => {
    const remediation = reviewItem.remediation;
    switch (event.eventType) {
        case 'finding_opened': {
            const threadPath = buildThreadPath(
                reviewItem.projectUuid,
                reviewItem.agentUuid,
                event.payload.sourceThreadUuid,
            );
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
            };
        }
        case 'pr_opened':
            return {
                label: 'Pull request opened',
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
        case 'preview_compiled':
            return { label: 'Preview compiled', meta: null };
        case 'verification_completed': {
            const threadPath = buildThreadPath(
                remediation?.previewProjectUuid ?? null,
                remediation?.previewAgentUuid ?? null,
                event.payload.previewThreadUuid,
            );
            return {
                label: 'Fix verified',
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
            return { label: 'Pull request merged', meta: null };
        case 'pr_closed':
            return { label: 'Pull request closed', meta: null };
        case 'resolved':
            return { label: 'Resolved', meta: null };
        case 'failed':
            return {
                label: 'Failed',
                meta: event.payload.errorMessage,
            };
        default:
            return { label: 'Activity', meta: null };
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
});

type Props = {
    reviewItem: AiAgentReviewItemSummary;
};

export const RemediationActivityTimeline: FC<Props> = ({ reviewItem }) => {
    const { data } = useAiAgentReviewItemActivity(reviewItem.fingerprint, {
        enabled: !!reviewItem.remediation,
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
        let previous: Date | null = null;
        const eventRows = data.events.map((event) => {
            const when = formatWhen(event.occurredAt, previous);
            previous = dayjs(event.occurredAt).toDate();
            return {
                key: event.uuid,
                when,
                state: 'done' as const,
                ...eventRow(event, reviewItem),
            };
        });
        return data.liveState
            ? [...eventRows, liveRow(data.liveState, data.liveMessage)]
            : eventRows;
    }, [data, reviewItem]);

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
                >
                    <span className={styles.when}>{row.when}</span>
                    <div className={styles.node} />
                    <div className={styles.event}>{row.label}</div>
                    {row.meta ? (
                        <div className={styles.meta}>{row.meta}</div>
                    ) : null}
                </li>
            ))}
        </Box>
    );
};
