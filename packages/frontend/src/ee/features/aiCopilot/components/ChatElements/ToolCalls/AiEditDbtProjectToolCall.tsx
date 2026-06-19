import {
    type CiChecks,
    type ToolEditDbtProjectOutput,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Menu,
    Paper,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import {
    IconCheck,
    IconChevronDown,
    IconEye,
    IconFileDiff,
    IconGitMerge,
    IconGitPullRequest,
    IconGitPullRequestClosed,
    IconSettings,
} from '@tabler/icons-react';
import confetti from 'canvas-confetti';
import { useEffect, useRef, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../../components/common/MantineIcon';
import { useClosePullRequest } from '../../../hooks/useClosePullRequest';
import { useMergePullRequest } from '../../../hooks/useMergePullRequest';
import {
    useCreateAgentThreadMessageMutation,
    useProjectAiAgent,
} from '../../../hooks/useProjectAiAgents';
import { usePullRequestCiChecks } from '../../../hooks/usePullRequestCiChecks';
import { POST_MERGE_MIGRATION_PROMPT } from '../../../postMergeMigrationPrompt';
import styles from './AiEditDbtProjectToolCall.module.css';
import { isMergeable } from './pullRequestActions';
import { INSTALL_ACTIONS, summarisePrUrl } from './pullRequestCardUtils';
import { PullRequestCiChecks } from './PullRequestCiChecks';
import { WritebackDiffModal } from './WritebackDiffModal';

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
    /**
     * The agent + thread this card belongs to. When present, merging the PR
     * also injects the (hidden) post-merge migration prompt so the agent
     * proactively assesses and repoints affected saved content. Absent in
     * contexts without a live thread (e.g. shared/read-only views).
     */
    agentUuid?: string;
    threadUuid?: string;
};

// ts-unused-exports:disable-next-line
export const InstallAppButton: FC<{
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
 * The "View" half of the card's action group: a single dropdown that opens the
 * Lightdash preview, the pull request on its host, or the diff viewer. The
 * preview entry is omitted when there's no preview (non-GitHub run, failed
 * preview, or a setup PR). Owns the diff modal it launches.
 */
// ts-unused-exports:disable-next-line
export const PullRequestViewMenu: FC<{
    projectUuid: string;
    prUrl: string;
    previewUrl: string | null;
    commitSha: string | null;
}> = ({ projectUuid, prUrl, previewUrl, commitSha }) => {
    const [diffOpened, setDiffOpened] = useState(false);

    return (
        <>
            <Menu position="bottom-start" withinPortal>
                <Menu.Target>
                    <Button
                        variant="default"
                        size="compact-sm"
                        leftSection={<MantineIcon icon={IconEye} size={14} />}
                        rightSection={
                            <MantineIcon icon={IconChevronDown} size={14} />
                        }
                    >
                        View
                    </Button>
                </Menu.Target>
                <Menu.Dropdown>
                    {previewUrl && (
                        <Menu.Item
                            component="a"
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            leftSection={
                                <MantineIcon icon={IconEye} size={14} />
                            }
                        >
                            Preview
                        </Menu.Item>
                    )}
                    <Menu.Item
                        component="a"
                        href={prUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        leftSection={
                            <MantineIcon icon={IconGitPullRequest} size={14} />
                        }
                    >
                        Pull request
                    </Menu.Item>
                    <Menu.Item
                        leftSection={
                            <MantineIcon icon={IconFileDiff} size={14} />
                        }
                        onClick={() => setDiffOpened(true)}
                    >
                        Diff
                    </Menu.Item>
                </Menu.Dropdown>
            </Menu>
            <WritebackDiffModal
                projectUuid={projectUuid}
                prUrl={prUrl}
                commitSha={commitSha}
                opened={diffOpened}
                onClose={() => setDiffOpened(false)}
            />
        </>
    );
};

// ts-unused-exports:disable-next-line
export const PullRequestActionButtons: FC<{
    ciChecks: CiChecks | null;
    isMerging: boolean;
    isClosing: boolean;
    onMerge: () => void;
    onClose: () => void;
}> = ({ ciChecks, isMerging, isClosing, onMerge, onClose }) => {
    const [armed, setArmed] = useState<'merge' | 'close' | null>(null);
    const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const mergeButtonRef = useRef<HTMLButtonElement>(null);
    const confettiOrigin = useRef<{ x: number; y: number } | null>(null);
    const wasMerged = useRef(ciChecks?.merged ?? false);

    const disarm = () => {
        if (armTimer.current) clearTimeout(armTimer.current);
        armTimer.current = null;
        setArmed(null);
    };
    const arm = (which: 'merge' | 'close') => {
        if (armTimer.current) clearTimeout(armTimer.current);
        setArmed(which);
        armTimer.current = setTimeout(() => setArmed(null), 3500);
    };

    useEffect(() => {
        const merged = ciChecks?.merged ?? false;
        if (merged && !wasMerged.current && confettiOrigin.current) {
            void confetti({
                disableForReducedMotion: true,
                particleCount: 70,
                startVelocity: 26,
                spread: 75,
                gravity: 0.9,
                scalar: 0.85,
                ticks: 120,
                zIndex: 400,
                colors: ['#7048e8', '#9775fa', '#b197fc', '#d0bfff', '#e5dbff'],
                origin: confettiOrigin.current,
            });
            confettiOrigin.current = null;
        }
        wasMerged.current = merged;
    }, [ciChecks?.merged]);

    if (!ciChecks) {
        return null;
    }

    if (ciChecks.merged) {
        return (
            <Button
                variant="light"
                color="violet"
                size="compact-sm"
                disabled
                className={styles.mergedStatus}
                leftSection={<MantineIcon icon={IconGitMerge} size={14} />}
            >
                Merged
            </Button>
        );
    }

    if (ciChecks.state === 'closed') {
        return (
            <Button
                variant="light"
                color="red"
                size="compact-sm"
                disabled
                className={styles.closedStatus}
                leftSection={
                    <MantineIcon icon={IconGitPullRequestClosed} size={14} />
                }
            >
                Closed
            </Button>
        );
    }

    const mergeArmed = armed === 'merge';
    const closeArmed = armed === 'close';

    const handleMergeClick = () => {
        if (!mergeArmed) {
            arm('merge');
            return;
        }
        const el = mergeButtonRef.current;
        if (el) {
            const rect = el.getBoundingClientRect();
            confettiOrigin.current = {
                x: (rect.left + rect.width / 2) / window.innerWidth,
                y: (rect.top + rect.height / 2) / window.innerHeight,
            };
        }
        disarm();
        onMerge();
    };

    const handleCloseClick = () => {
        if (!closeArmed) {
            arm('close');
            return;
        }
        disarm();
        onClose();
    };

    return (
        <Button.Group>
            <Button
                variant="default"
                size="compact-sm"
                loading={isClosing}
                onBlur={disarm}
                leftSection={
                    <MantineIcon
                        icon={closeArmed ? IconCheck : IconGitPullRequestClosed}
                        size={14}
                    />
                }
                onClick={handleCloseClick}
            >
                {closeArmed ? 'Confirm' : 'Close PR'}
            </Button>
            <Button
                ref={mergeButtonRef}
                variant="filled"
                color="green"
                size="compact-sm"
                loading={isMerging}
                disabled={!isMergeable(ciChecks)}
                onBlur={disarm}
                leftSection={
                    <MantineIcon
                        icon={mergeArmed ? IconCheck : IconGitMerge}
                        size={14}
                    />
                }
                onClick={handleMergeClick}
            >
                {mergeArmed ? 'Confirm' : 'Merge PR'}
            </Button>
        </Button.Group>
    );
};

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
    agentUuid,
    threadUuid,
}) => {
    // Hooks must run before the early returns below; the query is disabled until
    // there's a PR URL, so the error/no-PR branches don't fetch anything.
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
    const { mutate: sendThreadMessage } = useCreateAgentThreadMessageMutation(
        projectUuid,
        agentUuid,
        threadUuid,
    );
    // Only trigger the post-merge migration when the agent can actually edit
    // saved content — otherwise it would promise a repoint it can't perform.
    const { data: agent } = useProjectAiAgent(projectUuid, agentUuid);
    const canMigrateContent =
        !!agentUuid && !!threadUuid && agent?.enableContentTools === true;

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
        // The thread's pull request was already merged or closed, so further
        // edits can't be added here. Not a failure — guide the user to a new
        // thread rather than show a red error.
        if (metadata.errorCode === 'pull_request_not_open') {
            return (
                <Paper withBorder p="sm" radius="md">
                    <Group gap="xs" align="flex-start" wrap="nowrap">
                        <ThemeIcon
                            variant="light"
                            color="ldGray"
                            radius="md"
                            size="md"
                        >
                            <MantineIcon
                                icon={IconGitPullRequestClosed}
                                size={16}
                            />
                        </ThemeIcon>
                        <Stack gap={2}>
                            <Text size="sm" fw={500}>
                                This thread's pull request is closed
                            </Text>
                            <Text size="xs" c="ldGray.6">
                                Its pull request has already been merged or
                                closed, so further changes can't be added here.
                                Start a new thread to request more changes.
                            </Text>
                        </Stack>
                    </Group>
                </Paper>
            );
        }
        // Any other error (e.g. a write-permission 403, or an unclassified
        // failure): the agent's own reply already explains what went wrong and,
        // where relevant, how to fix it — so a separate red "Writeback failed"
        // card would only duplicate that prose without adding an action. Render
        // nothing and let the agent's message carry the explanation.
        return null;
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
    const title = 'Edited semantic layer';
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
                        {/* Sits inline to the right of the title when there's room
                            (the original look); below ~520px the .header container
                            query drops this onto its own full-width row (View left,
                            Close/Merge right), and below 360px the two controls
                            stack. View = preview / PR / diff; the preview URL is
                            generated server-side during the run — a setup PR never
                            previews itself. */}
                        <PullRequestViewMenu
                            projectUuid={projectUuid}
                            prUrl={metadata.prUrl}
                            previewUrl={
                                isPreviewDeploySetup
                                    ? null
                                    : (metadata.previewUrl ?? null)
                            }
                            commitSha={metadata.commitSha ?? null}
                        />
                        <PullRequestActionButtons
                            ciChecks={ciChecks ?? null}
                            isMerging={isMerging}
                            isClosing={isClosing}
                            onMerge={() =>
                                merge(
                                    {
                                        prUrl: resolvedPrUrl,
                                        sha: metadata.commitSha ?? null,
                                    },
                                    // Once merged, ask the agent to assess and
                                    // repoint affected saved content. Injected as
                                    // a hidden turn (filtered from the chat by
                                    // AgentChatDisplay) so only the agent's
                                    // proactive reply shows. Only when the agent
                                    // can edit content — otherwise it can't act
                                    // on the request.
                                    canMigrateContent
                                        ? {
                                              onSuccess: () =>
                                                  sendThreadMessage({
                                                      prompt: POST_MERGE_MIGRATION_PROMPT,
                                                      hidden: true,
                                                  }),
                                          }
                                        : undefined,
                                )
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
