import { AnchorButton } from '@blueprintjs/core';
import { FC } from 'react';
import { useSavedCharts } from '../../../hooks/useSpaces';
import LinkButton from '../../common/LinkButton';
import ResourceList from '../../common/ResourceList';

const LatestSavedCharts: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const savedChartsRequest = useSavedCharts(projectUuid);
    const savedCharts = savedChartsRequest.data || [];
    const featuredCharts = savedCharts
        .sort(
            (a, b) =>
                new Date(b.updatedAt).getTime() -
                new Date(a.updatedAt).getTime(),
        )
        .slice(0, 5);

    return (
        <ResourceList
            resourceIcon="chart"
            resourceType="saved_chart"
            resourceList={featuredCharts}
            showSpaceColumn
            enableSorting={false}
            showCount={false}
            headerTitle="Recently updated charts"
            headerAction={
                savedCharts.length > 0 ? (
                    <LinkButton
                        text={`View all ${savedCharts.length}`}
                        minimal
                        outlined
                        intent="primary"
                        href={`/projects/${projectUuid}/saved`}
                    />
                ) : (
                    <AnchorButton
                        target="_blank"
                        text="Learn"
                        minimal
                        outlined
                        href="https://docs.lightdash.com/get-started/exploring-data/sharing-insights"
                    />
                )
            }
            getURL={({ uuid }) => `/projects/${projectUuid}/saved/${uuid}`}
        />
    );
};

export default LatestSavedCharts;
