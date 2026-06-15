import { Anchor, Button, Group, Stack, Text } from '@mantine-8/core';
import { IconArrowUpRight, IconFileDiff } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { useAiAgentThreadPullRequest } from '../hooks/useProjectAiAgents';
import { usePullRequestCiChecks } from '../hooks/usePullRequestCiChecks';
import { PullRequestCiChecks } from './ChatElements/ToolCalls/PullRequestCiChecks';
import styles from './ThreadPullRequestCard.module.css';

type Props = {
    projectUuid: string;
    agentUuid: string;
    threadUuid: string;
};

/**
 * Right-panel overview of the writeback PR a thread is associated with: what
 * the PR does (the AI-written summary), live state and diff stats, CI checks.
 * Renders nothing for threads without a PR.
 */
export const ThreadPullRequestCard: FC<Props> = ({
    projectUuid,
    agentUuid,
    threadUuid,
}) => {
    const { data: pullRequest } = useAiAgentThreadPullRequest(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    const { data: ciChecks } = usePullRequestCiChecks(
        pullRequest ? projectUuid : undefined,
        pullRequest?.prUrl,
        pullRequest?.commitSha ?? null,
    );

    if (!pullRequest) {
        return null;
    }

    const stateLabel =
        pullRequest.state === 'merged'
            ? 'merged'
            : pullRequest.state === 'closed'
              ? 'closed'
              : pullRequest.state === 'open'
                ? 'open'
                : null;

    return (
        <div className={styles.gutter}>
            <Stack gap="xs" className={styles.card}>
                <Text className={styles.label}>Pull request</Text>

                <Stack gap={2}>
                    <Text className={styles.title} lineClamp={2}>
                        {pullRequest.title ??
                            pullRequest.summary ??
                            'Writeback pull request'}
                    </Text>
                    <Text className={styles.ref}>
                        {pullRequest.repo}
                        {pullRequest.prNumber
                            ? ` #${pullRequest.prNumber}`
                            : ''}
                        {stateLabel ? (
                            <>
                                {' · '}
                                <span
                                    className={
                                        pullRequest.state === 'merged'
                                            ? styles.stateMerged
                                            : pullRequest.state === 'closed'
                                              ? styles.stateClosed
                                              : undefined
                                    }
                                >
                                    {stateLabel}
                                </span>
                            </>
                        ) : null}
                    </Text>
                </Stack>

                {pullRequest.summary &&
                    pullRequest.summary !== pullRequest.title && (
                        <Text className={styles.summary}>
                            {pullRequest.summary}
                        </Text>
                    )}

                {(pullRequest.changedFiles !== null ||
                    pullRequest.additions !== null) && (
                    <div className={styles.statRow}>
                        {pullRequest.changedFiles !== null && (
                            <span>
                                {pullRequest.changedFiles}{' '}
                                {pullRequest.changedFiles === 1
                                    ? 'file'
                                    : 'files'}
                            </span>
                        )}
                        {pullRequest.additions !== null && (
                            <span>
                                <span className={styles.additions}>
                                    +{pullRequest.additions}
                                </span>{' '}
                                <span className={styles.deletions}>
                                    −{pullRequest.deletions ?? 0}
                                </span>
                            </span>
                        )}
                    </div>
                )}

                <PullRequestCiChecks
                    prUrl={pullRequest.prUrl}
                    ciChecks={ciChecks ?? null}
                />

                <Group gap="xs" grow>
                    <Button
                        component="a"
                        href={pullRequest.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        size="compact-sm"
                        variant="filled"
                        color="dark"
                        rightSection={
                            <MantineIcon icon={IconArrowUpRight} size="sm" />
                        }
                    >
                        View PR
                    </Button>
                    <Anchor
                        href={`${pullRequest.prUrl}/files`}
                        target="_blank"
                        rel="noopener noreferrer"
                        underline="never"
                    >
                        <Button
                            size="compact-sm"
                            variant="default"
                            fullWidth
                            leftSection={
                                <MantineIcon icon={IconFileDiff} size="sm" />
                            }
                        >
                            View diff
                        </Button>
                    </Anchor>
                </Group>
            </Stack>
        </div>
    );
};
