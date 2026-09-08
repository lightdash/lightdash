import { type RoadmapItem } from '@lightdash/common';
import { Anchor, Box, Group, Stack, Text } from '@mantine/core';
import {
    IconArrowUpRight,
    IconBrandGithub,
    IconGitPullRequest,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC, type ReactNode } from 'react';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeSanitize from 'rehype-sanitize';
import { CopyActionIcon } from '../../../components/common/CopyActionIcon';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import {
    getPriorityColor,
    getStatusColor,
    formatRoadmapDetailDate,
} from '../../pages/roadmapUtils';
import styles from './RoadmapRequestDetails.module.css';

const RoadmapRailRow: FC<{ label: string; children: ReactNode }> = ({
    label,
    children,
}) => (
    <Group className={styles.detailRailRow} wrap="nowrap" gap="sm">
        <Text className={styles.detailRailLabel}>{label}</Text>
        <Box className={styles.detailRailValue}>{children}</Box>
    </Group>
);

export const RoadmapRequestDetails: FC<{
    item: RoadmapItem | null;
    onClose: () => void;
}> = ({ item, onClose }) => {
    return (
        <MantineModal
            opened={item !== null}
            onClose={onClose}
            size="72rem"
            title={
                <Text
                    component="span"
                    className={styles.detailHeaderTitle}
                    lineClamp={2}
                >
                    {item?.title ?? 'Roadmap request'}
                </Text>
            }
            cancelLabel={false}
            modalBodyProps={{ py: 'lg' }}
            bodyScrollAreaMaxHeight="calc(85vh - 120px)"
        >
            {item && (
                <Box className={styles.detailLayout}>
                    <Stack className={styles.detailMain} gap={0}>
                        <Stack gap="md">
                            <Text className={styles.detailSectionLabel}>
                                Description
                            </Text>
                            {item.description ? (
                                <Box className={styles.markdown}>
                                    <MarkdownPreview
                                        source={item.description}
                                        rehypePlugins={[
                                            rehypeSanitize,
                                            [
                                                rehypeExternalLinks,
                                                {
                                                    target: '_blank',
                                                    rel: [
                                                        'noopener',
                                                        'noreferrer',
                                                    ],
                                                },
                                            ],
                                        ]}
                                    />
                                </Box>
                            ) : (
                                <Text c="dimmed" fz="sm">
                                    No further detail is available for this
                                    request.
                                </Text>
                            )}
                        </Stack>
                    </Stack>

                    <Box className={styles.detailDivider} />

                    <Stack
                        gap="sm"
                        className={styles.detailRailColumn}
                        component="aside"
                        aria-label="Roadmap request properties"
                    >
                        <Stack gap={2}>
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
                                        bg={`${getPriorityColor(
                                            item.priority,
                                        )}.6`}
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
                                        <MantineIcon
                                            icon={IconBrandGithub}
                                            size={14}
                                        />
                                        View GitHub issue
                                        <MantineIcon
                                            icon={IconArrowUpRight}
                                            size={13}
                                        />
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
                                        <MantineIcon
                                            icon={IconGitPullRequest}
                                            size={14}
                                        />
                                        View pull request
                                        <MantineIcon
                                            icon={IconArrowUpRight}
                                            size={13}
                                        />
                                    </Anchor>
                                </RoadmapRailRow>
                            )}
                        </Stack>
                    </Stack>
                </Box>
            )}
        </MantineModal>
    );
};
