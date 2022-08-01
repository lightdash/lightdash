import { AnchorButton } from '@blueprintjs/core';
import { SpaceQuery } from '@lightdash/common';
import React, { FC } from 'react';
import {
    useDeleteMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import { useSavedCharts } from '../../../hooks/useSpaces';
import ActionCardList from '../../common/ActionCardList';
import SavedQueryForm from '../../SavedQueries/SavedQueryForm';
import LatestCard from '../LatestCard';
import { ViewAllButton } from './LatestSavedCharts.style';

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
        <LatestCard
            isLoading={savedChartsRequest.isLoading}
            title="Last updated charts"
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
            <ActionCardList
                title="Saved charts"
                useUpdate={useUpdateMutation}
                useDelete={useDeleteMutation()}
                dataList={featuredCharts}
                getURL={(savedQuery: SpaceQuery) => {
                    const { uuid } = savedQuery;
                    return `/projects/${projectUuid}/saved/${uuid}`;
                }}
                ModalContent={SavedQueryForm}
                isHomePage
                isChart
            />
        </LatestCard>
    );
};

export default LatestSavedCharts;
