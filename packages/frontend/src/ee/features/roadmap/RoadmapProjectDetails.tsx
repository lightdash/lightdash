import { type RoadmapProjectGroup } from '@lightdash/common';
import { Box, Button, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import {
    formatRoadmapDetailDate,
    getPriorityColor,
} from '../../pages/roadmapUtils';
import {
    FollowProjectButton,
    type FollowProjectAction,
} from './FollowProjectButton';
import { RoadmapDetails, RoadmapRailRow } from './RoadmapDetails';
import styles from './RoadmapDetails.module.css';
import {
    getProjectPresentation,
    getRoadmapPriorityLabel,
} from './roadmapPresentation';
import { RoadmapSlackThreadsRow } from './RoadmapSlackThreads';

export function RoadmapProjectDetails({
    item,
    status,
    onClose,
    onOpenBoard,
    followAction,
}: {
    item: RoadmapProjectGroup | null;
    status: { label: string; color: string };
    onClose: () => void;
    onOpenBoard: (() => void) | null;
    followAction: FollowProjectAction;
}) {
    const { t } = useTranslation('eeMisc');
    const project = item ? getProjectPresentation(item.project) : null;
    return (
        <RoadmapDetails
            compact
            opened={item !== null}
            onClose={onClose}
            title={item?.project.title ?? t('roadmap.details.projectFallback')}
            propertiesLabel={t('roadmap.details.projectProperties')}
            headerActions={
                item ? (
                    <FollowProjectButton item={item} {...followAction} />
                ) : null
            }
            actions={
                onOpenBoard ? (
                    <Button onClick={onOpenBoard} size="xs" variant="default">
                        {t('roadmap.details.openBoard')}
                    </Button>
                ) : null
            }
            description={
                <Text
                    fz="sm"
                    c={item?.project.description.trim() ? undefined : 'dimmed'}
                >
                    {item?.project.description.trim() ||
                        t('roadmap.details.noProjectDetail')}
                </Text>
            }
        >
            {project && (
                <>
                    <RoadmapRailRow label={t('roadmap.details.status')}>
                        <Group gap={6} wrap="nowrap">
                            <Box
                                className={styles.detailPropertyDot}
                                bg={status.color}
                            />
                            <Text className={styles.detailRailText}>
                                {status.label}
                            </Text>
                        </Group>
                    </RoadmapRailRow>
                    <RoadmapRailRow label={t('roadmap.details.priority')}>
                        <Group gap={6} wrap="nowrap">
                            <Box
                                className={styles.detailPropertyDot}
                                bg={`${getPriorityColor(project.priority)}.6`}
                            />
                            <Text className={styles.detailRailText}>
                                {getRoadmapPriorityLabel(project.priority)}
                            </Text>
                        </Group>
                    </RoadmapRailRow>
                    <RoadmapRailRow label={t('roadmap.details.progress')}>
                        <Text className={styles.detailRailText}>
                            {project.progress}%
                        </Text>
                    </RoadmapRailRow>
                    <RoadmapRailRow
                        label={t('roadmap.details.lastTicketUpdate')}
                    >
                        <Text className={styles.detailRailText}>
                            {item?.project.lastIssueUpdatedAt ? (
                                <time
                                    dateTime={item.project.lastIssueUpdatedAt}
                                >
                                    {formatRoadmapDetailDate(
                                        item.project.lastIssueUpdatedAt,
                                    )}
                                </time>
                            ) : (
                                '—'
                            )}
                        </Text>
                    </RoadmapRailRow>
                    {item && item.ownRequestCount > 0 && (
                        <RoadmapRailRow label={t('roadmap.details.following')}>
                            <Text className={styles.detailRailText}>
                                {t('roadmap.details.ticketCount', {
                                    count: item.ownRequestCount,
                                })}
                            </Text>
                        </RoadmapRailRow>
                    )}
                    {item?.hasDirectNeed && (
                        <RoadmapRailRow label={t('roadmap.details.interest')}>
                            <Text className={styles.detailRailText}>
                                {t('roadmap.details.following')}
                            </Text>
                        </RoadmapRailRow>
                    )}
                    {item && (
                        <RoadmapSlackThreadsRow urls={item.slackThreadUrls} />
                    )}
                </>
            )}
        </RoadmapDetails>
    );
}
