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
    IconMessages,
} from '@tabler/icons-react';
import { type FC, type SyntheticEvent, useState } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useAiAgentAdminReviewItem,
    useCreateAiAgentReviewItemWriteback,
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
    const [previewOpen, setPreviewOpen] = useState(false);

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
    const workThreadUrl =
        current.remediation?.previewProjectUuid &&
        current.remediation.previewAgentUuid &&
        current.remediation.previewThreadUuid
            ? `/projects/${current.remediation.previewProjectUuid}/ai-agents/${current.remediation.previewAgentUuid}/threads/${current.remediation.previewThreadUuid}`
            : null;
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
            ) : (
                <Stack gap={mode === 'drawer' ? 'xs' : 6} align="flex-start">
                    <Group gap={4} wrap="wrap">
                        {current.linkedPrUrl && (
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
                        )}

                        {workThreadUrl && (
                            <Button
                                component="a"
                                href={workThreadUrl}
                                onClick={stopPropagation}
                                size={buttonSize}
                                fz="xs"
                                variant="default"
                                leftSection={
                                    <MantineIcon
                                        icon={IconMessages}
                                        size="xs"
                                    />
                                }
                            >
                                Test fix
                            </Button>
                        )}

                        {canCreatePr && !current.linkedPrUrl && (
                            <Tooltip
                                label="Open a pull request against the dbt project (runs in the background, may take a few minutes)"
                                withArrow
                                multiline
                                maw={260}
                            >
                                <Button
                                    data-tour="reviews-create-pr"
                                    size={buttonSize}
                                    radius="md"
                                    variant="default"
                                    loading={createWriteback.isLoading}
                                    onClick={(event) => {
                                        stopPropagation(event);
                                        if (previewsDiff) {
                                            setPreviewOpen(true);
                                        } else {
                                            createWriteback.mutate(
                                                current.fingerprint,
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
