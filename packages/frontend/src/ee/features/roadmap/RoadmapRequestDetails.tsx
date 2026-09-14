import { type RoadmapItem } from '@lightdash/common';
import { Anchor, Box, Group, Text } from '@mantine/core';
import {
    IconArrowUpRight,
    IconBrandGithub,
    IconGitPullRequest,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import {
    getPriorityColor,
    getStatusColor,
    formatRoadmapDetailDate,
} from '../../pages/roadmapUtils';
import { RoadmapDetails, RoadmapRailRow } from './RoadmapDetails';
import styles from './RoadmapDetails.module.css';

export const RoadmapRequestDetails: FC<{
    item: RoadmapItem | null;
    onClose: () => void;
}> = ({ item, onClose }) => (
    <RoadmapDetails
        opened={item !== null}
        onClose={onClose}
        title={item?.title ?? 'Roadmap request'}
        propertiesLabel="Roadmap request properties"
        actions={null}
        description={
            item?.description ? (
                <Box className={styles.markdown}>
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
            )
        }
    >
        {item && (
            <>
                <RoadmapRailRow label="Status">
                    <Group gap={6} wrap="nowrap">
                        <Box
                            className={styles.detailPropertyDot}
                            bg={`${getStatusColor(item.status)}.6`}
                        />
                        <Text className={styles.detailRailText}>
                            {item.status}
                        </Text>
                    </Group>
                </RoadmapRailRow>
                <RoadmapRailRow label="Priority">
                    <Group gap={6} wrap="nowrap">
                        <Box
                            className={styles.detailPropertyDot}
                            bg={`${getPriorityColor(item.priority)}.6`}
                        />
                        <Text className={styles.detailRailText}>
                            {item.priority}
                        </Text>
                    </Group>
                </RoadmapRailRow>
                <RoadmapRailRow label="Ticket ID">
                    <Group gap={4} wrap="nowrap">
                        <Text className={styles.detailTicketId}>
                            {item.ticketId}
                        </Text>
                        <CopyActionIcon
                            value={item.ticketId}
                            copyLabel="Copy ticket ID"
                            size="xs"
                            variant="transparent"
                        />
                    </Group>
                </RoadmapRailRow>
                <RoadmapRailRow label="Created">
                    <Text className={styles.detailRailText}>
                        {formatRoadmapDetailDate(item.createdAt)}
                    </Text>
                </RoadmapRailRow>
                <RoadmapRailRow label="Updated">
                    <Text className={styles.detailRailText}>
                        {formatRoadmapDetailDate(item.updatedAt)}
                    </Text>
                </RoadmapRailRow>
                {item.issueUrl && (
                    <RoadmapRailRow label="Issue">
                        <Anchor
                            href={item.issueUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.detailRailLink}
                        >
                            <MantineIcon icon={IconBrandGithub} size={14} />
                            View GitHub issue
                            <MantineIcon icon={IconArrowUpRight} size={13} />
                        </Anchor>
                    </RoadmapRailRow>
                )}
                {item.pullRequestUrl && (
                    <RoadmapRailRow label="Pull request">
                        <Anchor
                            href={item.pullRequestUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.detailRailLink}
                        >
                            <MantineIcon icon={IconGitPullRequest} size={14} />
                            View pull request
                            <MantineIcon icon={IconArrowUpRight} size={13} />
                        </Anchor>
                    </RoadmapRailRow>
                )}
            </>
        )}
    </RoadmapDetails>
);
