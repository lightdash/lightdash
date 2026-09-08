import { RoadmapItemStatus, type RoadmapItem } from '@lightdash/common';
import { Anchor, Badge, Box, Group, Stack, Text } from '@mantine/core';
import MarkdownPreview from '@uiw/react-markdown-preview';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import MantineModal from '../../../components/common/MantineModal';
import {
    getPriorityColor,
    getStatusColor,
    formatRoadmapDetailDate,
} from '../../pages/roadmapUtils';
import classes from './RoadmapProjects.module.css';

export function RoadmapRequestDetails({
    item,
    onClose,
}: {
    item: RoadmapItem | null;
    onClose: () => void;
}) {
    return (
        <MantineModal
            opened={item !== null}
            onClose={onClose}
            title={item?.title ?? 'Request details'}
            size="xl"
            cancelLabel={false}
        >
            {item && (
                <Stack gap="lg">
                    <Group gap="sm">
                        <Badge
                            color={
                                getStatusColor(item.status) === 'ldGray'
                                    ? 'gray'
                                    : getStatusColor(item.status)
                            }
                        >
                            {item.status === RoadmapItemStatus.BACKLOG
                                ? 'Planned'
                                : item.status}
                        </Badge>
                        <Badge
                            color={
                                getPriorityColor(item.priority) === 'ldGray'
                                    ? 'gray'
                                    : getPriorityColor(item.priority)
                            }
                        >
                            {item.priority}
                        </Badge>
                        <Text c="dimmed" fz="xs">
                            {item.ticketId}
                        </Text>
                    </Group>
                    {item.description ? (
                        <Box className={classes.markdown}>
                            <MarkdownPreview
                                source={item.description}
                                rehypePlugins={[
                                    rehypeSanitize,
                                    [
                                        rehypeExternalLinks,
                                        {
                                            target: '_blank',
                                            rel: ['noopener', 'noreferrer'],
                                        },
                                    ],
                                ]}
                            />
                        </Box>
                    ) : (
                        <Text c="dimmed" fz="sm">
                            No further detail is available for this request.
                        </Text>
                    )}
                    <Group gap="lg">
                        <Text fz="xs" c="dimmed">
                            Created {formatRoadmapDetailDate(item.createdAt)}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            Updated {formatRoadmapDetailDate(item.updatedAt)}
                        </Text>
                    </Group>
                    <Group gap="lg">
                        {item.issueUrl && (
                            <Anchor
                                href={item.issueUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                fz="sm"
                            >
                                View GitHub issue ↗
                            </Anchor>
                        )}
                        {item.pullRequestUrl && (
                            <Anchor
                                href={item.pullRequestUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                fz="sm"
                            >
                                View pull request ↗
                            </Anchor>
                        )}
                    </Group>
                </Stack>
            )}
        </MantineModal>
    );
}
