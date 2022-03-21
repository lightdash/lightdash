import { AnchorButton } from '@blueprintjs/core';
import React, { FC } from 'react';
import { useSavedCharts } from '../../../hooks/useSpaces';
import LatestCard from '../LatestCard';
import {
    ChartName,
    CreateChartButton,
    ViewAllButton,
} from './LatestSavedCharts.style';

const LatestSavedCharts: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const savedChartsRequest = useSavedCharts(projectUuid);
    const savedCharts = savedChartsRequest.data || [];
    return (
        <LatestCard
            isLoading={savedChartsRequest.isLoading}
            title="Browse saved charts"
            headerAction={
                savedCharts.length > 0 ? (
                    <ViewAllButton
                        text={`View all ${savedCharts.length}`}
                        minimal
                        outlined
                        href={`/projects/${projectUuid}/saved`}
                    />
                ) : (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        outlined
                        href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
                        style={{ width: 100 }}
                    />
                )
            }
        >
            {savedCharts
                .sort(
                    (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime(),
                )
                .slice(0, 5)
                .map(({ uuid, name }) => (
                    <ChartName
                        key={uuid}
                        minimal
                        href={`/projects/${projectUuid}/saved/${uuid}`}
                        alignText="left"
                    >
                        {name}
                    </ChartName>
                ))}
            {savedCharts.length === 0 && (
                <CreateChartButton
                    minimal
                    href={`/projects/${projectUuid}/tables`}
                    intent="primary"
                >
                    + Create a saved chart
                </CreateChartButton>
            )}
        </LatestCard>
    );
};

export default LatestSavedCharts;
