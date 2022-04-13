import { AnchorButton } from '@blueprintjs/core';
import { SpaceQuery } from 'common';
import React, { FC } from 'react';
import {
    useDeleteMutation,
    useUpdateMutation,
} from '../../../hooks/useSavedQuery';
import { useSavedCharts } from '../../../hooks/useSpaces';
import ActionCardList from '../../common/ActionCardList';
import SavedQueryForm from '../../SavedQueries/SavedQueryForm';
import LatestCard from '../LatestCard';
import { CreateChartButton, ViewAllButton } from './LatestSavedCharts.style';

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
            <ActionCardList
                title="Saved charts"
                useUpdate={useUpdateMutation}
                useDelete={useDeleteMutation()}
                dataList={savedCharts}
                getURL={(savedQuery: SpaceQuery) => {
                    const { uuid } = savedQuery;
                    return `/projects/${projectUuid}/saved/${uuid}`;
                }}
                ModalContent={SavedQueryForm}
                isHomePage
            />
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
