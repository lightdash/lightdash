import { Box } from '@mantine-8/core';
import { type FC } from 'react';
import LightdashVisualization from '../../../../../components/LightdashVisualization';
import VisualizationProvider from '../../../../../components/LightdashVisualization/VisualizationProvider';
import { type getChartVisualizationFromAiQuery } from '../../utils/getChartVisualizationFromAiQuery';

type Props = {
    vizData: ReturnType<typeof getChartVisualizationFromAiQuery>;
};

export const AiChartVisualization: FC<Props> = ({ vizData }) => {
    if (!vizData) return null;

    return (
        <Box h="100%" mih={400}>
            <VisualizationProvider minimal {...vizData}>
                <LightdashVisualization
                    className="sentry-block ph-no-capture"
                    data-testid="ai-visualization"
                />
            </VisualizationProvider>
        </Box>
    );
};
