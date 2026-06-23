import { type AiAgentReviewItemSummary } from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Code,
    Group,
    Stack,
    Text,
    Tooltip,
} from '@mantine-8/core';
import {
    IconArrowUpRight,
    IconBolt,
    IconLayoutColumns,
    IconRefresh,
} from '@tabler/icons-react';
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
    const isRecurring = item.findingCount > 1;

    const startKind = getStartWritebackKind(item);
    const isRetry = isWritebackRetry(item);

    const isExample = isExampleReviewItem(item.uuid);

    const remediation = item.remediation;
    const hasWorkspace = Boolean(remediation);
    const workspaceHref = `/generalSettings/ai/reviews/${encodeURIComponent(
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
                <Stack gap={8}>
                    <Group
                        justify="space-between"
                        align="flex-start"
                        wrap="nowrap"
                    >
                        <Stack gap={2} style={{ minWidth: 0 }}>
                            {isExample && (
                                <Badge
                                    size="xs"
                                    radius="sm"
                                    variant="default"
                                    color="gray"
                                    w="fit-content"
                                >
                                    Example
                                </Badge>
                            )}
                            <Text fz="sm" fw={550} lineClamp={2}>
                                {title}
                            </Text>
                            {targetAnchor && (
                                <Code
                                    fz={10}
                                    c="dimmed"
                                    w="fit-content"
                                    maw="100%"
                                >
                                    {targetAnchor}
                                </Code>
                            )}
                        </Stack>
                        <Group gap={8} wrap="nowrap" align="center">
                            {isRecurring && (
                                <Tooltip
                                    variant="xs"
                                    label={`Seen ${item.findingCount} times`}
                                    position="top"
                                >
                                    <Badge
                                        size="sm"
                                        radius="sm"
                                        variant="default"
                                        color="gray"
                                    >
                                        {item.findingCount}×
                                    </Badge>
                                </Tooltip>
                            )}
                            <Tooltip
                                variant="xs"
                                position="top"
                                label={`First seen ${formatReviewDate(
                                    item.firstSeenAt,
                                )} · last seen ${formatReviewDate(
                                    item.lastSeenAt,
                                )}`}
                            >
                                <Text
                                    fz="xs"
                                    c="dimmed"
                                    style={{ whiteSpace: 'nowrap' }}
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
                        <Group gap={6} wrap="wrap">
                            <CategoryBadge
                                color={
                                    reviewRootCauseColors[item.primaryRootCause]
                                }
                                label={
                                    reviewRootCauseLabels[item.primaryRootCause]
                                }
                            />
                        </Group>

                        {!isExample && (
                            <ReviewAssigneeMenu
                                projectUuid={
                                    item.projectUuid ??
                                    item.latestFinding?.projectUuid ??
                                    null
                                }
                                fingerprint={item.fingerprint}
                                assignedToUserUuid={item.assignedToUserUuid}
                                className={
                                    item.assignedToUserUuid
                                        ? undefined
                                        : styles.assigneeUnassigned
                                }
                            />
                        )}
                    </Group>
                </Stack>
            </Box>

            {hasWorkspace &&
                (activityLabel ? (
                    <Box className={styles.cardFooter}>
                        <Group gap={6} align="center">
                            {isAgentRunning ? (
                                <AiAgentIcon size={14} animated />
                            ) : (
                                <Box
                                    pos="relative"
                                    w={7}
                                    h={7}
                                    bg="indigo.5"
                                    className={styles.pulse}
                                    style={{ borderRadius: '50%' }}
                                />
                            )}
                            <Text fz="xs" c="dimmed">
                                {activityLabel}
                            </Text>
                        </Group>
                    </Box>
                ) : isExample ? (
                    <Box
                        data-tour="reviews-workspace"
                        className={styles.cardFooter}
                    >
                        <Group gap={6} align="center">
                            <MantineIcon icon={IconLayoutColumns} size={13} />
                            <Text fz="xs">Open workspace</Text>
                        </Group>
                        <MantineIcon icon={IconArrowUpRight} size={14} />
                    </Box>
                ) : (
                    <Box
                        component={Link}
                        to={workspaceHref}
                        onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                            e.stopPropagation()
                        }
                        className={styles.cardFooter}
                    >
                        <Group gap={6} align="center">
                            <MantineIcon icon={IconLayoutColumns} size={13} />
                            <Text fz="xs">Open workspace</Text>
                        </Group>
                        <MantineIcon icon={IconArrowUpRight} size={14} />
                    </Box>
                ))}

            {startKind !== null &&
                (isExample ? (
                    <Button
                        data-tour="reviews-pr"
                        size="compact-xs"
                        radius="md"
                        variant="filled"
                        disabled
                        leftSection={<MantineIcon icon={IconBolt} size={12} />}
                        className={styles.startAction}
                    >
                        Start fix
                    </Button>
                ) : (
                    <Button
                        size="compact-xs"
                        radius="md"
                        variant="filled"
                        leftSection={
                            <MantineIcon
                                icon={isRetry ? IconRefresh : IconBolt}
                                size={12}
                            />
                        }
                        loading={createWriteback.isLoading}
                        className={styles.startAction}
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
                                createWriteback.mutate(item.fingerprint);
                            }
                        }}
                    >
                        {isRetry ? 'Retry fix' : 'Start fix'}
                    </Button>
                ))}

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
