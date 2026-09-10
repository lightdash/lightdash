import { type RoadmapProjectGroup } from '@lightdash/common';
import { Box, Button, Group, Text } from '@mantine/core';
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
import { getProjectPresentation } from './roadmapPresentation';

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
    const project = item ? getProjectPresentation(item.project) : null;
    return (
        <RoadmapDetails
            compact
            opened={item !== null}
            onClose={onClose}
            title={item?.project.title ?? 'Roadmap project'}
            propertiesLabel="Roadmap project properties"
            headerActions={
                item ? (
                    <FollowProjectButton item={item} {...followAction} />
                ) : null
            }
            actions={
                onOpenBoard ? (
                    <Button onClick={onOpenBoard} size="xs" variant="default">
                        Open project board
                    </Button>
                ) : null
            }
            description={
                <Text
                    fz="sm"
                    c={item?.project.description.trim() ? undefined : 'dimmed'}
                >
                    {item?.project.description.trim() ||
                        'No further detail is available for this project.'}
                </Text>
            }
        >
            {project && (
                <>
                    <RoadmapRailRow label="Status">
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
                    <RoadmapRailRow label="Priority">
                        <Group gap={6} wrap="nowrap">
                            <Box
                                className={styles.detailPropertyDot}
                                bg={`${getPriorityColor(project.priority)}.6`}
                            />
                            <Text className={styles.detailRailText}>
                                {project.priority}
                            </Text>
                        </Group>
                    </RoadmapRailRow>
                    <RoadmapRailRow label="Progress">
                        <Text className={styles.detailRailText}>
                            {project.progress}%
                        </Text>
                    </RoadmapRailRow>
                    <RoadmapRailRow label="Last ticket update">
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
                        <RoadmapRailRow label="Following">
                            <Text className={styles.detailRailText}>
                                {item.ownRequestCount}{' '}
                                {item.ownRequestCount === 1
                                    ? 'ticket'
                                    : 'tickets'}
                            </Text>
                        </RoadmapRailRow>
                    )}
                    {item?.hasDirectNeed && (
                        <RoadmapRailRow label="Interest">
                            <Text className={styles.detailRailText}>
                                Following
                            </Text>
                        </RoadmapRailRow>
                    )}
                </>
            )}
        </RoadmapDetails>
    );
}
