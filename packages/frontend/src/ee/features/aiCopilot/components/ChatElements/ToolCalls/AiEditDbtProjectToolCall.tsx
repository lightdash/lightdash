import { type ToolEditDbtProjectOutput } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconBrandGithub,
    IconBrandGitlab,
    IconExternalLink,
    IconEye,
    IconGitPullRequest,
    IconSettings,
    type Icon as TablerIcon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import styles from './AiEditDbtProjectToolCall.module.css';
import { PullRequestCiChecks } from './PullRequestCiChecks';

type Props = {
    metadata: ToolEditDbtProjectOutput['metadata'];
    projectUuid: string;
    /**
     * True when this card belongs to a `setupPreviewDeploy` PR (one that adds
     * the preview-deploy workflow) rather than a data-change `editDbtProject`
     * PR. A setup PR never produces a preview of itself, so the preview
     * affordance is suppressed for it.
     */
    isPreviewDeploySetup: boolean;
};

// Parses "https://github.com/lightdash/jaffle/pull/29" into "lightdash/jaffle"
// so the user can verify which repo the PR landed in at a glance. The PR number
// itself lives on the link button. Best-effort — any non-GitHub host or
// malformed path falls back to the raw hostname.
const summarisePrUrl = (prUrl: string): string | null => {
    try {
        const url = new URL(prUrl);
        const segments = url.pathname.split('/').filter(Boolean);
        if (
            url.hostname === 'github.com' &&
            segments.length >= 4 &&
            segments[2] === 'pull'
        ) {
            const [owner, repo] = segments;
            return `${owner}/${repo}`;
        }
        return url.hostname;
    } catch {
        return null;
    }
};

// A writeback can't open a PR until the org installs the matching git app.
// The agent's prose already explains the problem, so we surface only the
// one-click action — each `installUrl` is the same install entry point as the
// Integrations settings page, opened in a new tab so the user keeps their thread.
const INSTALL_ACTIONS: Record<
    'github_not_installed' | 'gitlab_not_installed',
    { icon: TablerIcon; installUrl: string; cta: string }
> = {
    github_not_installed: {
        icon: IconBrandGithub,
        installUrl: '/api/v1/github/install',
        cta: 'Install GitHub App',
    },
    gitlab_not_installed: {
        icon: IconBrandGitlab,
        installUrl: '/api/v1/gitlab/install',
        cta: 'Connect GitLab',
    },
};

const InstallAppButton: FC<{
    action: (typeof INSTALL_ACTIONS)[keyof typeof INSTALL_ACTIONS];
}> = ({ action }) => (
    <Group gap={0}>
        <Button
            component="a"
            href={action.installUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="default"
            size="compact-sm"
            leftSection={<MantineIcon icon={action.icon} size={14} />}
        >
            {action.cta}
        </Button>
    </Group>
);

/**
 * Inline card rendered after a `editDbtProject` tool call lands. The
 * agent's textual reply intentionally omits the URL (the editDbtProject
 * tool result instructs it to) on the expectation that this card surfaces
 * it instead — matching the Slack experience where the user's mention gets
 * a green-tick reaction plus the PR link in the agent message body.
 */
export const AiEditDbtProjectToolCall: FC<Props> = ({
    metadata,
    projectUuid,
    isPreviewDeploySetup,
}) => {
    if (metadata.status === 'error') {
        // When the project just needs its git app installed, the agent's reply
        // already explains it — surface only the one-click install action.
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
        // The project's dbt connection isn't GitHub/GitLab, so there's no app to
        // install — point the user at the connection settings to switch it.
        if (metadata.errorCode === 'unsupported_source_control') {
            return (
                <Paper withBorder p="sm" radius="md">
                    <Group gap="xs" align="flex-start" wrap="nowrap">
                        <ThemeIcon
                            variant="light"
                            color="ldGray"
                            radius="md"
                            size="md"
                        >
                            <MantineIcon icon={IconGitPullRequest} size={16} />
                        </ThemeIcon>
                        <Stack gap="xs">
                            <Stack gap={2}>
                                <Text size="sm" fw={500}>
                                    Source control not supported
                                </Text>
                                <Text size="xs" c="ldGray.6">
                                    AI writeback needs this project's dbt
                                    connection to use GitHub or GitLab. Update
                                    the connection to open pull requests from
                                    chat.
                                </Text>
                            </Stack>
                            <Group gap={0}>
                                <Button
                                    component={Link}
                                    to={`/generalSettings/projectManagement/${projectUuid}/settings`}
                                    variant="default"
                                    size="compact-sm"
                                    leftSection={
                                        <MantineIcon
                                            icon={IconSettings}
                                            size={14}
                                        />
                                    }
                                >
                                    Edit project connection
                                </Button>
                            </Group>
                        </Stack>
                    </Group>
                </Paper>
            );
        }
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
    // The commit this card is pinned to — shown so the user can see each turn's
    // card tracks its own commit (and its CI), not just the PR's live head.
    const shortCommitSha = metadata.commitSha
        ? metadata.commitSha.slice(0, 7)
        : null;
    // This turn's line delta, shown colour-coded next to the commit.
    const additions = metadata.additions ?? null;
    const deletions = metadata.deletions ?? null;
    const hasDiffStat = additions !== null || deletions !== null;
    // Short PR/MR reference for the link button (e.g. "#123").
    const prNumberMatch = metadata.prUrl.match(
        /\/(?:pull|merge_requests)\/(\d+)/,
    );
    const prLinkLabel = prNumberMatch
        ? `#${prNumberMatch[1]}`
        : 'View pull request';
    const title = 'Edited semantic layer';

    return (
        <Paper withBorder p="sm" radius="md" className={styles.card}>
            <Stack gap="xs">
                <Group
                    gap="sm"
                    align="center"
                    justify="space-between"
                    wrap="nowrap"
                >
                    <Group gap="xs" align="center" wrap="nowrap">
                        <MantineIcon
                            icon={IconGitPullRequest}
                            size={18}
                            color="ldGray.7"
                        />
                        <Stack gap={0}>
                            <Text size="sm" fw={500}>
                                {title}
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
                        {/* Preview URL is generated server-side during the run
                            and carried in the tool metadata — no PR-comment
                            lookup. A setup PR never previews itself. */}
                        {!isPreviewDeploySetup && metadata.previewUrl && (
                            <Button
                                component="a"
                                href={metadata.previewUrl}
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
                        )}
                        <Button
                            component="a"
                            href={metadata.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            variant="default"
                            size="compact-sm"
                            rightSection={
                                <MantineIcon
                                    icon={IconExternalLink}
                                    size={14}
                                />
                            }
                        >
                            {prLinkLabel}
                        </Button>
                    </Box>
                </Group>
                <PullRequestCiChecks
                    projectUuid={projectUuid}
                    prUrl={metadata.prUrl}
                    commitSha={metadata.commitSha ?? null}
                />
            </Stack>
        </Paper>
    );
};
