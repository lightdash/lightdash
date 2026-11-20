import { Box } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { ColumnWindowingProvider } from '../../components/common/Table/ColumnWindowingProvider';
import EmbedChart from '../features/embed/EmbedChart/components/EmbedChart';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedChartPage: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
    const { chartUuid: chartUuidFromParams } = useParams<{
        chartUuid?: string;
    }>();
    const { embedToken, savedQueryUuid } = useEmbed();

    // Prioritize savedQueryUuid from embed context over URL params to avoid edge cases
    // where SDK customers might have chartUuid in their app that doesn't point to a Lightdash chart
    const chartUuid = savedQueryUuid ?? chartUuidFromParams;

    if (!embedToken) {
        return (
            <Box mt="lg">
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </Box>
        );
    }

    if (!chartUuid) {
        return (
            <Box mt="lg">
                <SuboptimalState title="Missing chart ID" icon={IconUnlink} />
            </Box>
        );
    }

    return (
        <ColumnWindowingProvider enabled>
            <EmbedChart
                containerStyles={containerStyles}
                savedQueryUuid={chartUuid}
            />
        </ColumnWindowingProvider>
    );
};

export default EmbedChartPage;
