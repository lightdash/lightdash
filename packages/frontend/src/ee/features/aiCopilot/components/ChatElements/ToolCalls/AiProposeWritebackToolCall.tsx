import { type ToolProposeWritebackOutput } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    ThemeIcon,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconExternalLink,
    IconEye,
    IconGitPullRequest,
    IconInfoCircle,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useProjectCiStatus } from '../../../hooks/useProjectCiStatus';
import {
    isPreviewWaitTimedOut,
    usePullRequestPreview,
} from '../../../hooks/usePullRequestPreview';
import styles from './AiProposeWritebackToolCall.module.css';

type Props = {
    metadata: ToolProposeWritebackOutput['metadata'];
    projectUuid: string;
    /** When the write-back PR was opened — anchors the ~10 min preview wait. */
    prCreatedAt: string;
    /**
     * True when this card belongs to a `setupPreviewDeploy` PR (one that adds
     * the preview-deploy workflow) rather than a data-change `proposeWriteback`
     * PR. A setup PR never produces a preview of itself, so the preview
     * affordance is suppressed for it.
     */
    isPreviewDeploySetup: boolean;
};

// Parses "https://github.com/lightdash/jaffle/pull/29" into "lightdash/jaffle #29"
// so the user can verify where the PR landed at a glance. Best-effort — any
// non-GitHub host or malformed path falls back to the raw hostname.
const summarisePrUrl = (prUrl: string): string | null => {
    try {
        const url = new URL(prUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        if (
            url.hostname === 'github.com' &&
            segments.length >= 4 &&
            segments[2] === 'pull'
        ) {
            const [owner, repo, , number] = segments;
            return `${owner}/${repo} #${number}`;
        }
        return url.hostname;
    } catch {
        return null;
    }
};

/**
 * Inline card rendered after a `proposeWriteback` tool call lands. The
 * agent's textual reply intentionally omits the URL (the proposeWriteback
 * tool result instructs it to) on the expectation that this card surfaces
 * it instead — matching the Slack experience where the user's mention gets
 * a green-tick reaction plus the PR link in the agent message body.
 */
export const AiProposeWritebackToolCall: FC<Props> = ({
    metadata,
    projectUuid,
    prCreatedAt,
    isPreviewDeploySetup,
}) => {
    const prUrl = metadata.status === 'success' ? metadata.prUrl : null;

    // Does this project's repo deploy Lightdash previews? `false` means it was
    // scanned and has no preview workflow; `undefined`/null means unknown.
    const { data: ciStatus } = useProjectCiStatus(projectUuid);
    const previewDeployConfigured = ciStatus?.hasPreviewDeployWorkflow;

    // Only wait for a preview URL when one is actually expected — poll unless we
    // positively know the repo has no preview workflow (avoids polling forever
    // on repos that never produce a preview). The poll also stops ~10 min after
    // the PR was opened. A preview-deploy *setup* PR never previews itself, so
    // never poll for one.
    const { data: preview } = usePullRequestPreview(
        projectUuid,
        isPreviewDeploySetup || previewDeployConfigured === false
            ? null
            : prUrl,
        prCreatedAt,
    );
    const previewTimedOut = isPreviewWaitTimedOut(prCreatedAt);

    if (metadata.status === 'error') {
        return (
            <Paper withBorder p="sm" radius="md" bg="red.0">
                <Group gap="xs" align="center" wrap="nowrap">
                    <ThemeIcon
                        variant="light"
                        color="red"
                        radius="md"
                        size="md"
                    >
                        <MantineIcon icon={IconAlertTriangle} size={16} />
                    </ThemeIcon>
                    <Stack gap={0}>
                        <Text size="sm" fw={500} c="red.7">
                            Writeback failed
                        </Text>
                        <Text size="xs" c="red.6">
                            The agent's run hit an error and no pull request was
                            opened.
                        </Text>
                    </Stack>
                </Group>
            </Paper>
        );
    }

    if (!metadata.prUrl) {
        // Success but no PR opened (writeback agent decided no file changes
        // were needed). Reassure rather than surface as a failure.
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

    const summary = summarisePrUrl(metadata.prUrl);
    // Older tool-call rows predate `prAction`; treat a missing value as 'opened'.
    const title =
        metadata.prAction === 'updated'
            ? 'Pull request updated'
            : 'Pull request opened';

    return (
        <Paper withBorder p="sm" radius="md" className={styles.card}>
            <Group
                gap="sm"
                align="center"
                justify="space-between"
                wrap="nowrap"
            >
                <Group gap="xs" align="center" wrap="nowrap">
                    <ThemeIcon
                        variant="light"
                        color="green"
                        radius="md"
                        size="md"
                    >
                        <MantineIcon icon={IconGitPullRequest} size={16} />
                    </ThemeIcon>
                    <Stack gap={0}>
                        <Text size="sm" fw={500}>
                            {title}
                        </Text>
                        {summary && (
                            <Text size="xs" c="ldGray.6">
                                {summary}
                            </Text>
                        )}
                    </Stack>
                </Group>
                <Box className={styles.actions}>
                    {isPreviewDeploySetup ? null : preview?.previewUrl ? (
                        <Button
                            component="a"
                            href={preview.previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="default"
                            size="compact-sm"
                            leftSection={
                                <MantineIcon icon={IconEye} size={14} />
                            }
                        >
                            View preview
                        </Button>
                    ) : previewDeployConfigured && !previewTimedOut ? (
                        // A preview deploy is configured but its URL hasn't been
                        // posted yet — surface that it's on the way rather than
                        // showing nothing.
                        <Button
                            variant="default"
                            size="compact-sm"
                            disabled
                            leftSection={<Loader size={14} />}
                        >
                            Preparing preview…
                        </Button>
                    ) : previewDeployConfigured && previewTimedOut ? (
                        // Configured but no preview URL after ~10 min — the
                        // deploy likely failed or was skipped. Tell the user
                        // rather than spinning forever.
                        <Tooltip
                            withinPortal
                            multiline
                            w={220}
                            label="The preview deploy didn't post a URL within 10 minutes. It may have failed or been skipped — check the pull request."
                        >
                            <Group gap={4} wrap="nowrap" c="ldGray.6">
                                <MantineIcon icon={IconInfoCircle} size={14} />
                                <Text size="xs" c="ldGray.6">
                                    Preview didn't appear
                                </Text>
                            </Group>
                        </Tooltip>
                    ) : null}
                    <Button
                        component="a"
                        href={metadata.prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="filled"
                        size="compact-sm"
                        rightSection={
                            <MantineIcon icon={IconExternalLink} size={14} />
                        }
                    >
                        View pull request
                    </Button>
                </Box>
            </Group>
        </Paper>
    );
};
