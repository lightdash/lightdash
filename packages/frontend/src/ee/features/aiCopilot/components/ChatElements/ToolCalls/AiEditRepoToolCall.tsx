import { type ToolEditRepoOutput } from '@lightdash/common';
import { Box, Group, Paper, Stack, Text, ThemeIcon } from '@mantine-8/core';
import { IconGitPullRequest } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useClosePullRequest } from '../../../hooks/useClosePullRequest';
import { useMergePullRequest } from '../../../hooks/useMergePullRequest';
import { usePullRequestCiChecks } from '../../../hooks/usePullRequestCiChecks';
import {
    InstallAppButton,
    PullRequestActionButtons,
    PullRequestViewMenu,
} from './AiEditDbtProjectToolCall';
import styles from './AiEditDbtProjectToolCall.module.css';
import { INSTALL_ACTIONS, summarisePrUrl } from './pullRequestCardUtils';
import { PullRequestCiChecks } from './PullRequestCiChecks';

type Props = {
    metadata: ToolEditRepoOutput['metadata'];
    projectUuid: string;
};

/**
 * Inline card for a general `editRepo` tool call — the counterpart to
 * {@link AiEditDbtProjectToolCall} for non-dbt repos. Reuses its PR/CI/merge
 * building blocks (View menu, action buttons, CI checks) but drops the dbt-only
 * bits: there's no Lightdash preview for an arbitrary repo (previewUrl is always
 * null) and merging does NOT inject the post-merge semantic-layer migration
 * prompt. Errors render the install action where actionable and otherwise
 * nothing — the agent's own reply carries the explanation.
 */
export const AiEditRepoToolCall: FC<Props> = ({ metadata, projectUuid }) => {
    const prUrl = metadata.status === 'success' ? metadata.prUrl : null;
    const ciCommitSha =
        metadata.status === 'success' ? (metadata.commitSha ?? null) : null;
    const { data: ciChecks } = usePullRequestCiChecks(
        projectUuid,
        prUrl,
        ciCommitSha,
    );
    const { mutate: merge, isLoading: isMerging } =
        useMergePullRequest(projectUuid);
    const { mutate: close, isLoading: isClosing } =
        useClosePullRequest(projectUuid);

    if (metadata.status === 'error') {
        // The org just needs the matching git app installed — surface the
        // one-click action; the agent's reply already explains the rest.
        if (
            metadata.errorCode === 'github_not_installed' ||
            metadata.errorCode === 'gitlab_not_installed'
        ) {
            return (
                <InstallAppButton
                    action={INSTALL_ACTIONS[metadata.errorCode]}
                />
            );
        }
        // Forbidden repo, denied path, repo too large, closed PR, etc.: the
        // agent's prose already explains what happened and why, so a separate
        // red card would only duplicate it. Render nothing.
        return null;
    }

    if (!metadata.prUrl) {
        return (
            <Paper withBorder p="sm" radius="md">
                <Group gap="xs" align="center" wrap="nowrap">
                    <ThemeIcon
                        variant="light"
                        color="ldGray"
                        radius="md"
                        size="md"
                    >
                        <MantineIcon icon={IconGitPullRequest} size={16} />
                    </ThemeIcon>
                    <Text size="sm" c="ldGray.7">
                        No file changes were needed — no pull request was
                        opened.
                    </Text>
                </Group>
            </Paper>
        );
    }

    // Prefer the explicit repository, falling back to parsing the PR URL.
    const summary = metadata.repository ?? summarisePrUrl(metadata.prUrl);
    const shortCommitSha = metadata.commitSha
        ? metadata.commitSha.slice(0, 7)
        : null;
    const additions = metadata.additions ?? null;
    const deletions = metadata.deletions ?? null;
    const hasDiffStat = additions !== null || deletions !== null;
    const resolvedPrUrl = metadata.prUrl;

    return (
        <Paper
            withBorder
            p="sm"
            radius="md"
            className={
                ciChecks?.merged
                    ? `${styles.card} ${styles.cardMerged}`
                    : ciChecks?.state === 'closed'
                      ? `${styles.card} ${styles.cardClosed}`
                      : styles.card
            }
        >
            <Stack gap="xs">
                <Box className={styles.header}>
                    <Group
                        className={styles.titleBlock}
                        gap="xs"
                        align="center"
                        wrap="nowrap"
                    >
                        <MantineIcon
                            icon={IconGitPullRequest}
                            size={18}
                            color="ldGray.7"
                        />
                        <Stack gap={0}>
                            <Text size="sm" fw={500}>
                                Edited repository
                            </Text>
                            {summary && (
                                <Group gap={6} wrap="nowrap">
                                    <Text size="xs" c="ldGray.6">
                                        {summary}
                                    </Text>
                                    {shortCommitSha && (
                                        <>
                                            <Text size="xs" c="ldGray.4">
                                                ·
                                            </Text>
                                            <Text
                                                size="xs"
                                                c="ldGray.6"
                                                ff="monospace"
                                                title={
                                                    metadata.commitSha ??
                                                    undefined
                                                }
                                            >
                                                {shortCommitSha}
                                            </Text>
                                        </>
                                    )}
                                    {hasDiffStat && (
                                        <Group gap={4} wrap="nowrap">
                                            {additions !== null && (
                                                <Text
                                                    size="xs"
                                                    c="green"
                                                    ff="monospace"
                                                >
                                                    +{additions}
                                                </Text>
                                            )}
                                            {deletions !== null && (
                                                <Text
                                                    size="xs"
                                                    c="red"
                                                    ff="monospace"
                                                >
                                                    −{deletions}
                                                </Text>
                                            )}
                                        </Group>
                                    )}
                                </Group>
                            )}
                        </Stack>
                    </Group>
                    <Box className={styles.actions}>
                        <PullRequestViewMenu
                            projectUuid={projectUuid}
                            prUrl={metadata.prUrl}
                            previewUrl={null}
                            commitSha={metadata.commitSha ?? null}
                        />
                        <PullRequestActionButtons
                            ciChecks={ciChecks ?? null}
                            isMerging={isMerging}
                            isClosing={isClosing}
                            onMerge={() =>
                                merge({
                                    prUrl: resolvedPrUrl,
                                    sha: metadata.commitSha ?? null,
                                })
                            }
                            onClose={() => close({ prUrl: resolvedPrUrl })}
                        />
                    </Box>
                </Box>
                <PullRequestCiChecks
                    prUrl={metadata.prUrl}
                    ciChecks={ciChecks ?? null}
                    hasMergeAction
                />
            </Stack>
        </Paper>
    );
};
