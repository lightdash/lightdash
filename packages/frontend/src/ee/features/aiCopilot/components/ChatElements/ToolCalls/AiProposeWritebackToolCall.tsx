import { type ToolProposeWritebackOutput } from '@lightdash/common';
import { Button, Group, Paper, Stack, Text, ThemeIcon } from '@mantine-8/core';
import {
    IconAlertTriangle,
    IconExternalLink,
    IconEye,
    IconGitPullRequest,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { usePullRequestPreview } from '../../../hooks/usePullRequestPreview';

type Props = {
    metadata: ToolProposeWritebackOutput['metadata'];
    projectUuid: string;
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
}) => {
    // Poll for the preview environment once a PR exists. The hook is disabled
    // until there's a PR URL, so it's a no-op for the error / no-PR branches.
    const prUrl = metadata.status === 'success' ? metadata.prUrl : null;
    const { data: preview } = usePullRequestPreview(projectUuid, prUrl);

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

    return (
        <Paper withBorder p="sm" radius="md">
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
                            Pull request opened
                        </Text>
                        {summary && (
                            <Text size="xs" c="ldGray.6">
                                {summary}
                            </Text>
                        )}
                    </Stack>
                </Group>
                <Group gap="xs" wrap="nowrap">
                    {preview?.previewUrl && (
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
                    )}
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
                </Group>
            </Group>
        </Paper>
    );
};
