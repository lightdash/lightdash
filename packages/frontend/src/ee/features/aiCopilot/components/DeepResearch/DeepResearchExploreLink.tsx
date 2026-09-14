import { Anchor, Group } from '@mantine/core';
import { IconExternalLink } from '@tabler/icons-react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useDeepResearchChartQuery } from '../../hooks/useDeepResearch';
import styles from './DeepResearchReport.module.css';
import { useDeepResearchOpenInExploreUrl } from './useDeepResearchExploreUrl';

type Props = {
    projectUuid: string;
    runUuid: string;
    queryUuid: string;
};

export const DeepResearchExploreLink = ({
    projectUuid,
    runUuid,
    queryUuid,
}: Props) => {
    const chartQuery = useDeepResearchChartQuery({
        projectUuid,
        runUuid,
        queryUuid,
    });
    const openInExploreUrl = useDeepResearchOpenInExploreUrl(
        chartQuery.data,
        projectUuid,
    );
    if (!chartQuery.data || !openInExploreUrl) {
        return null;
    }
    return (
        <Anchor
            href={openInExploreUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.exploreLink}
            aria-label={`Open ${chartQuery.data.title} in Explore`}
        >
            <Group component="span" gap={4} wrap="nowrap">
                Open in Explore
                <MantineIcon icon={IconExternalLink} size={13} />
            </Group>
        </Anchor>
    );
};
