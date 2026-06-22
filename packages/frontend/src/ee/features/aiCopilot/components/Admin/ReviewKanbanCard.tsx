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
    IconBox,
    IconLayoutColumns,
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
import { getStartWritebackKind } from './reviewLane';

type Props = {
    item: AiAgentReviewItemSummary;
    isSelected: boolean;
    onSelect: (item: AiAgentReviewItemSummary) => void;
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

    const remediation = item.remediation;
    const hasWorkspace = Boolean(remediation);
    const workspaceHref = `/generalSettings/ai/reviews/${encodeURIComponent(
        item.fingerprint,
    )}`;
    const hasPreview = Boolean(remediation?.previewProjectUuid);

    const isPreviewBuilding =
        remediation?.status === 'queued' || remediation?.status === 'running';

    const previewHref =
        remediation?.previewProjectUuid &&
        remediation?.previewAgentUuid &&
        remediation?.previewThreadUuid
            ? `/projects/${remediation.previewProjectUuid}/ai-agents/${remediation.previewAgentUuid}/threads/${remediation.previewThreadUuid}`
            : remediation?.previewProjectUuid
              ? `/projects/${remediation.previewProjectUuid}/home`
              : null;

    return (
        <Box
            className={`${styles.card}${isSelected ? ` ${styles.cardSelected}` : ''}`}
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
                            {isAgentRunning && (
                                <AiAgentIcon size={14} animated />
                            )}
                            {isRecurring && (
                                <Tooltip
                                    variant="xs"
                                    label={`Seen ${item.findingCount} times`}
                                    position="top"
                                >
                                    <Badge
                                        size="sm"
                                        radius="sm"
                                        variant="light"
                                        color="orange"
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
                    </Group>
                </Stack>
            </Box>

            {!hasWorkspace &&
                hasPreview &&
                !isPreviewBuilding &&
                previewHref && (
                    <Box
                        component="a"
                        href={previewHref}
                        onClick={(e: React.MouseEvent<HTMLAnchorElement>) =>
                            e.stopPropagation()
                        }
                        className={styles.cardFooter}
                    >
                        <Group gap={6} align="center">
                            <MantineIcon icon={IconBox} size={13} />
                            <Text fz="xs">Preview project</Text>
                        </Group>
                        <MantineIcon icon={IconArrowUpRight} size={14} />
                    </Box>
                )}
            {!hasWorkspace && hasPreview && isPreviewBuilding && (
                <Box className={styles.cardFooter}>
                    <Group gap={6} align="center">
                        <MantineIcon icon={IconBox} size={13} />
                        <Text fz="xs">Preview project</Text>
                    </Group>
                    <Group gap={6} align="center">
                        <Box
                            pos="relative"
                            w={7}
                            h={7}
                            bg="yellow.5"
                            className={styles.pulse}
                            style={{ borderRadius: '50%' }}
                        />
                        <Text fz="xs" c="dimmed">
                            Building…
                        </Text>
                    </Group>
                </Box>
            )}

            {hasWorkspace && (
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
            )}

            {startKind !== null && (
                <Button
                    size="compact-xs"
                    radius="md"
                    variant="filled"
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
                    Start
                </Button>
            )}

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
