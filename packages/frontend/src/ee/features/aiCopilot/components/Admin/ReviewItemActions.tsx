import { type AiAgentReviewItemSummary } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    Loader,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconInfoCircle,
    IconLayoutColumns,
} from '@tabler/icons-react';
import { type FC, type SyntheticEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentAdminReviewItem,
    useCreateAiAgentReviewItemWriteback,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { ProjectContextWritebackModal } from './ProjectContextWritebackModal';
import {
    shouldShowWritebackBlockedReason,
    writebackBlockedReasonLabels,
} from './reviewItemDetails';

type ReviewItemActionsProps = {
    reviewItem: AiAgentReviewItemSummary;
    mode?: 'table' | 'drawer';
};

export const ReviewItemActions: FC<ReviewItemActionsProps> = ({
    reviewItem,
    mode = 'table',
}) => {
    const createWriteback = useCreateAiAgentReviewItemWriteback();
    const updateStatus = useUpdateAiAgentReviewItemStatus();
    const navigate = useNavigate();
    const [previewOpen, setPreviewOpen] = useState(false);

    const workspaceUrl = `/generalSettings/ai/issues/${encodeURIComponent(
        reviewItem.fingerprint,
    )}`;

    const propInFlight =
        reviewItem.prWritebackStatus === 'queued' ||
        reviewItem.prWritebackStatus === 'running' ||
        reviewItem.remediation?.status === 'pr_open';
    const { data: polled } = useAiAgentAdminReviewItem(reviewItem.fingerprint, {
        enabled: propInFlight,
        refetchInterval:
            reviewItem.remediation?.status === 'pr_open' ? 10_000 : 2500,
    });
    const current = polled ?? reviewItem;

    // Terminal items are already closed; everything before that (To Do, In
    // Progress, …) can still be dismissed.
    const isTerminal =
        current.status === 'resolved' ||
        current.status === 'dismissed' ||
        current.status === 'duplicate';

    const isWritebackInFlight =
        current.prWritebackStatus === 'queued' ||
        current.prWritebackStatus === 'running';
    const canCreatePr = current.writebackEligibility.eligible;
    const blockedReason = current.writebackEligibility.eligible
        ? null
        : current.writebackEligibility.reason;
    const blockedReasonLabel = shouldShowWritebackBlockedReason(blockedReason)
        ? writebackBlockedReasonLabels[blockedReason]
        : null;
    const previewsDiff = current.primaryRootCause === 'project_context';

    const phase = current.prWritebackMessage ?? 'Opening pull request…';
    const remediationError =
        current.remediation?.status === 'failed'
            ? current.remediation.errorMessage
            : null;
    const buttonSize: 'xs' | 'compact-xs' =
        mode === 'drawer' ? 'xs' : 'compact-xs';
    const stopPropagation = (event: SyntheticEvent) => event.stopPropagation();
    const errorIconSize = mode === 'drawer' ? 16 : 15;

    return (
        <>
            {isWritebackInFlight ? (
                // The drawer's Activity timeline owns the live progress row —
                // a second spinner in the corner would duplicate it.
                mode === 'drawer' ? null : (
                    <Tooltip label={phase} withArrow openDelay={300}>
                        <Group gap={8} wrap="nowrap" maw={180}>
                            <Loader size={12} color="ldGray.5" />
                            <Text fz="xs" c="ldGray.6" lineClamp={1}>
                                {phase}
                            </Text>
                        </Group>
                    </Tooltip>
                )
            ) : current.status === 'triage' ? (
                <Group gap={4} wrap="nowrap">
                    <Button
                        size={buttonSize}
                        radius="md"
                        variant="filled"
                        color="indigo"
                        loading={updateStatus.isLoading}
                        onClick={(event) => {
                            stopPropagation(event);
                            updateStatus.mutate({
                                fingerprint: current.fingerprint,
                                body: { status: 'open', dismissedReason: null },
                            });
                        }}
                    >
                        Accept
                    </Button>
                    <Button
                        size={buttonSize}
                        radius="md"
                        variant="default"
                        loading={updateStatus.isLoading}
                        onClick={(event) => {
                            stopPropagation(event);
                            updateStatus.mutate({
                                fingerprint: current.fingerprint,
                                body: {
                                    status: 'dismissed',
                                    dismissedReason: 'not_actionable',
                                },
                            });
                        }}
                    >
                        Dismiss
                    </Button>
                </Group>
            ) : (
                <Stack gap={mode === 'drawer' ? 'xs' : 6} align="flex-start">
                    <Group gap={4} wrap="wrap">
                        {/* Once a remediation exists, the workspace is the one
                            place to view the PR and the verification — collapse
                            to a single entry point. */}
                        {current.remediation ? (
                            <Button
                                component={Link}
                                to={workspaceUrl}
                                onClick={stopPropagation}
                                size={buttonSize}
                                fz="xs"
                                variant="light"
                                color="indigo"
                                leftSection={
                                    <MantineIcon
                                        size="sm"
                                        icon={IconLayoutColumns}
                                    />
                                }
                            >
                                Open workspace
                            </Button>
                        ) : (
                            current.linkedPrUrl && (
                                <Button
                                    component="a"
                                    href={current.linkedPrUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={stopPropagation}
                                    size={buttonSize}
                                    fz="xs"
                                    loading={createWriteback.isLoading}
                                    variant="subtle"
                                    color="gray"
                                >
                                    View PR
                                </Button>
                            )
                        )}

                        {canCreatePr && !current.linkedPrUrl && (
                            <Tooltip
                                label="Open a pull request against the dbt project (runs in the background, may take a few minutes)"
                                withArrow
                                multiline
                                maw={260}
                            >
                                <Button
                                    size={buttonSize}
                                    radius="md"
                                    variant="default"
                                    loading={createWriteback.isLoading}
                                    onClick={(event) => {
                                        stopPropagation(event);
                                        if (previewsDiff) {
                                            setPreviewOpen(true);
                                        } else {
                                            void createWriteback
                                                .mutateAsync(
                                                    current.fingerprint,
                                                )
                                                .then(() =>
                                                    navigate(workspaceUrl),
                                                );
                                        }
                                    }}
                                >
                                    Create PR
                                </Button>
                            </Tooltip>
                        )}

                        {remediationError && (
                            <Tooltip
                                label={remediationError}
                                withArrow
                                openDelay={300}
                                maw={320}
                                multiline
                            >
                                <ActionIcon
                                    aria-label="Show writeback error"
                                    color="red"
                                    variant="transparent"
                                    size={20}
                                    onClick={stopPropagation}
                                >
                                    <MantineIcon
                                        icon={IconAlertCircle}
                                        color="red.6"
                                        size={errorIconSize}
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}

                        {/* Dismiss stays available past triage so an item can be
                            closed at any stage (the triage lane has its own
                            Accept/Dismiss pair above). */}
                        {!isTerminal && (
                            <Button
                                size={buttonSize}
                                radius="md"
                                variant="subtle"
                                color="gray"
                                loading={updateStatus.isLoading}
                                onClick={(event) => {
                                    stopPropagation(event);
                                    updateStatus.mutate({
                                        fingerprint: current.fingerprint,
                                        body: {
                                            status: 'dismissed',
                                            dismissedReason: 'not_actionable',
                                        },
                                    });
                                }}
                            >
                                Dismiss
                            </Button>
                        )}
                    </Group>

                    {!canCreatePr &&
                        !current.linkedPrUrl &&
                        !isWritebackInFlight &&
                        blockedReasonLabel && (
                            <Tooltip
                                label={blockedReasonLabel}
                                withArrow
                                openDelay={300}
                                disabled={mode === 'drawer'}
                            >
                                <Group
                                    gap={4}
                                    wrap="nowrap"
                                    maw={mode === 'drawer' ? 360 : 220}
                                >
                                    <MantineIcon
                                        icon={IconInfoCircle}
                                        size="xs"
                                    />
                                    <Text
                                        fz="xs"
                                        c="ldGray.6"
                                        fw={500}
                                        lineClamp={mode === 'drawer' ? 3 : 1}
                                    >
                                        {blockedReasonLabel}
                                    </Text>
                                </Group>
                            </Tooltip>
                        )}
                </Stack>
            )}

            {previewsDiff && (
                <ProjectContextWritebackModal
                    fingerprint={current.fingerprint}
                    opened={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </>
    );
};
