import { type AiAgentReviewItemSummary } from '@lightdash/common';
import { Badge, Box, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconBolt, IconLayoutColumns, IconRefresh } from '@tabler/icons-react';
import { type FC, useState } from 'react';
import { Link } from 'react-router';
import { CategoryBadge } from '../../../../../components/common/CategoryBadge';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    useCreateAiAgentReviewItemWriteback,
    useUpdateAiAgentReviewItemStatus,
} from '../../hooks/useAiAgentAdmin';
import { AiAgentIcon } from '../AiAgentIcon';
import { isExampleReviewItem } from './onboarding';
import { ProjectContextWritebackModal } from './ProjectContextWritebackModal';
import { ReviewAssigneeMenu } from './ReviewAssigneeMenu';
import {
    formatRelativeReviewDate,
    formatReviewDate,
    getIssueTitle,
    getTargetAnchor,
    reviewRootCauseColors,
    reviewRootCauseLabels,
} from './reviewItemDetails';
import styles from './ReviewKanbanBoard.module.css';
import { getStartWritebackKind, isWritebackRetry } from './reviewLane';
import { ReviewPriorityMenu } from './ReviewPriorityMenu';

type Props = {
    item: AiAgentReviewItemSummary;
    isSelected: boolean;
    onSelect: (item: AiAgentReviewItemSummary) => void;
};

// Live status shown in place of "Open workspace" while the fix is still being
// built; null once the workspace is genuinely openable.
const getWorkspaceActivityLabel = (
    item: AiAgentReviewItemSummary,
): string | null => {
    if (
        item.prWritebackStatus === 'queued' ||
        item.prWritebackStatus === 'running'
    ) {
        return 'Writing fix…';
    }
    switch (item.remediation?.status) {
        case 'queued':
        case 'running':
            return 'Building…';
        case 'pr_open':
            return 'Compiling…';
        default:
            return null;
    }
};

// ts-unused-exports:disable-next-line
export const ReviewKanbanCard: FC<Props> = ({ item, isSelected, onSelect }) => {
    const createWriteback = useCreateAiAgentReviewItemWriteback();
    const updateStatus = useUpdateAiAgentReviewItemStatus();
    const [previewOpen, setPreviewOpen] = useState(false);

    const isAgentRunning =
        item.prWritebackStatus === 'queued' ||
        item.prWritebackStatus === 'running';

    const title = getIssueTitle(item);
    const targetAnchor = getTargetAnchor(item);

    const startKind = getStartWritebackKind(item);
    const isRetry = isWritebackRetry(item);

    const isExample = isExampleReviewItem(item.uuid);

    const remediation = item.remediation;
    const hasWorkspace = Boolean(remediation);
    const workspaceHref = `/generalSettings/ai/issues/${encodeURIComponent(
        item.fingerprint,
    )}`;
    const activityLabel = getWorkspaceActivityLabel(item);

    return (
        <Box
            data-tour={isExample ? 'reviews-card' : undefined}
            className={`${styles.card}${isSelected ? ` ${styles.cardSelected}` : ''}${
                isExample ? ` ${styles.cardExample}` : ''
            }`}
        >
            <Box
                className={styles.cardBody}
                p="sm"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(item)}
                onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(item);
                    }
                }}
            >
                <Stack gap={10}>
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                    >
                        <Stack gap={2} miw={0}>
                            {isExample && (
                                <Badge
                                    size="xs"
                                    variant="default"
                                    w="fit-content"
                                >
                                    Example
                                </Badge>
                            )}
                            <Text
                                fw={500}
                                c="ldGray.9"
                                lineClamp={2}
                                className={styles.cardTitle}
                            >
                                {title}
                            </Text>
                        </Stack>
                        <Group gap={8} wrap="nowrap" align="center">
                            {!isExample && (
                                <ReviewPriorityMenu
                                    fingerprint={item.fingerprint}
                                    priority={item.priority}
                                    variant="bars"
                                    className={
                                        item.priority === 'none'
                                            ? styles.priorityNone
                                            : undefined
                                    }
                                />
                            )}
                            <Tooltip
                                position="top"
                                label={`First seen ${formatReviewDate(
                                    item.firstSeenAt,
                                )} · last seen ${formatReviewDate(
                                    item.lastSeenAt,
                                )}`}
                            >
                                <Text
                                    fz="xs"
                                    c="ldGray.5"
                                    className={styles.lastSeen}
                                >
                                    {formatRelativeReviewDate(item.lastSeenAt)}
                                </Text>
                            </Tooltip>
                        </Group>
                    </Group>

                    <Group
                        gap={6}
                        wrap="nowrap"
                        justify="space-between"
                        align="center"
                    >
                        <Group gap="sm" wrap="wrap">
                            <CategoryBadge
                                color={
                                    reviewRootCauseColors[item.primaryRootCause]
                                }
                                label={
                                    reviewRootCauseLabels[item.primaryRootCause]
                                }
                                bordered={false}
                                tooltip={targetAnchor ?? undefined}
                                className={styles.categoryLabel}
                            />
                        </Group>

                        <Group gap={10} wrap="nowrap" align="center">
                            {activityLabel && (
                                <Group gap={6} wrap="nowrap" align="center">
                                    {isAgentRunning ? (
                                        <AiAgentIcon size={13} animated />
                                    ) : (
                                        <Box
                                            pos="relative"
                                            w={6}
                                            h={6}
                                            bg="indigo.5"
                                            className={styles.pulse}
                                            style={{ borderRadius: '50%' }}
                                        />
                                    )}
                                    <Text fz="xs" c="ldGray.6">
                                        {activityLabel}
                                    </Text>
                                </Group>
                            )}
                            {hasWorkspace &&
                                !activityLabel &&
                                (isExample ? (
                                    <Box
                                        data-tour="reviews-workspace"
                                        className={styles.inlineAction}
                                    >
                                        <MantineIcon
                                            icon={IconLayoutColumns}
                                            size={13}
                                        />
                                        <Text fz="xs">Workspace</Text>
                                    </Box>
                                ) : (
                                    <Tooltip
                                        label="Open workspace"
                                        openDelay={300}
                                    >
                                        <Box
                                            component={Link}
                                            to={workspaceHref}
                                            onClick={(
                                                e: React.MouseEvent<HTMLAnchorElement>,
                                            ) => e.stopPropagation()}
                                            className={styles.inlineAction}
                                        >
                                            <MantineIcon
                                                icon={IconLayoutColumns}
                                                size={13}
                                            />
                                            <Text fz="xs">Workspace</Text>
                                        </Box>
                                    </Tooltip>
                                ))}
                            {startKind !== null && (
                                <Button
                                    data-tour={
                                        isExample ? 'reviews-pr' : undefined
                                    }
                                    variant="light"
                                    color="gray"
                                    size="compact-xs"
                                    h={20}
                                    px={6}
                                    disabled={isExample}
                                    loading={createWriteback.isLoading}
                                    leftSection={
                                        <MantineIcon
                                            icon={
                                                isRetry ? IconRefresh : IconBolt
                                            }
                                            size={12}
                                        />
                                    }
                                    className={
                                        isRetry || isExample
                                            ? styles.cardAction
                                            : `${styles.cardAction} ${styles.hoverAction}`
                                    }
                                    onPointerDown={(e: React.PointerEvent) =>
                                        e.stopPropagation()
                                    }
                                    onClick={(e: React.MouseEvent) => {
                                        e.stopPropagation();
                                        updateStatus.mutate({
                                            fingerprint: item.fingerprint,
                                            body: {
                                                status: 'in_progress',
                                                dismissedReason: null,
                                            },
                                        });
                                        if (startKind === 'modal') {
                                            setPreviewOpen(true);
                                        } else {
                                            createWriteback.mutate(
                                                item.fingerprint,
                                            );
                                        }
                                    }}
                                >
                                    {isRetry ? 'Retry fix' : 'Start fix'}
                                </Button>
                            )}
                            {!isExample && (
                                <ReviewAssigneeMenu
                                    projectUuid={
                                        item.projectUuid ??
                                        item.latestFinding?.projectUuid ??
                                        null
                                    }
                                    fingerprint={item.fingerprint}
                                    assignedToUserUuid={item.assignedToUserUuid}
                                    avatarSize={18}
                                    className={
                                        item.assignedToUserUuid
                                            ? undefined
                                            : styles.assigneeUnassigned
                                    }
                                />
                            )}
                        </Group>
                    </Group>
                </Stack>
            </Box>

            {startKind === 'modal' && (
                <ProjectContextWritebackModal
                    fingerprint={item.fingerprint}
                    opened={previewOpen}
                    onClose={() => setPreviewOpen(false)}
                />
            )}
        </Box>
    );
};
