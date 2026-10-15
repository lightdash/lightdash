import { type RoadmapItem } from '@lightdash/common';
import { Anchor, Box, Group, Text } from '@mantine/core';
import {
    IconArrowUpRight,
    IconBrandGithub,
    IconGitPullRequest,
} from '@tabler/icons-react';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
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
import {
    getRoadmapPriorityLabel,
    getRoadmapStatusLabel,
} from './roadmapPresentation';
import { RoadmapSlackThreadsRow } from './RoadmapSlackThreads';

export const RoadmapRequestDetails: FC<{
    item: RoadmapItem | null;
    onClose: () => void;
}> = ({ item, onClose }) => {
    const { t } = useTranslation('eeMisc');
    return (
        <RoadmapDetails
            opened={item !== null}
            onClose={onClose}
            title={item?.title ?? t('roadmap.details.requestFallback')}
            propertiesLabel={t('roadmap.details.requestProperties')}
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
                        {t('roadmap.details.noRequestDetail')}
                    </Text>
                )
            }
        >
            {item && (
                <>
                    <RoadmapRailRow label={t('roadmap.details.status')}>
                        <Group gap={6} wrap="nowrap">
                            <Box
                                className={styles.detailPropertyDot}
                                bg={`${getStatusColor(item.status)}.6`}
                            />
                            <Text className={styles.detailRailText}>
                                {getRoadmapStatusLabel(item.status)}
                            </Text>
                        </Group>
                    </RoadmapRailRow>
                    <RoadmapRailRow label={t('roadmap.details.priority')}>
                        <Group gap={6} wrap="nowrap">
                            <Box
                                className={styles.detailPropertyDot}
                                bg={`${getPriorityColor(item.priority)}.6`}
                            />
                            <Text className={styles.detailRailText}>
                                {getRoadmapPriorityLabel(item.priority)}
                            </Text>
                        </Group>
                    </RoadmapRailRow>
                    <RoadmapRailRow label={t('roadmap.details.ticketId')}>
                        <Group gap={4} wrap="nowrap">
                            <Text className={styles.detailTicketId}>
                                {item.ticketId}
                            </Text>
                            <CopyActionIcon
                                value={item.ticketId}
                                copyLabel={t('roadmap.details.copyTicketId')}
                                size="xs"
                                variant="transparent"
                            />
                        </Group>
                    </RoadmapRailRow>
                    <RoadmapRailRow label={t('roadmap.details.created')}>
                        <Text className={styles.detailRailText}>
                            {formatRoadmapDetailDate(item.createdAt)}
                        </Text>
                    </RoadmapRailRow>
                    <RoadmapRailRow label={t('roadmap.details.updated')}>
                        <Text className={styles.detailRailText}>
                            {formatRoadmapDetailDate(item.updatedAt)}
                        </Text>
                    </RoadmapRailRow>
                    {item.issueUrl && (
                        <RoadmapRailRow label={t('roadmap.details.issue')}>
                            <Anchor
                                href={item.issueUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={styles.detailRailLink}
                            >
                                <MantineIcon icon={IconBrandGithub} size={14} />
                                {t('roadmap.details.viewGithubIssue')}
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    size={13}
                                />
                            </Anchor>
                        </RoadmapRailRow>
                    )}
                    {item.pullRequestUrl && (
                        <RoadmapRailRow
                            label={t('roadmap.details.pullRequest')}
                        >
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
                                {t('whatsNew.viewPullRequest')}
                                <MantineIcon
                                    icon={IconArrowUpRight}
                                    size={13}
                                />
                            </Anchor>
                        </RoadmapRailRow>
                    )}
                    <RoadmapSlackThreadsRow urls={item.slackThreadUrls} />
                </>
            )}
        </RoadmapDetails>
    );
};
