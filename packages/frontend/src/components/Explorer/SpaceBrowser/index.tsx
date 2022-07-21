import { NonIdealState, Spinner } from '@blueprintjs/core';
import { Space } from '@lightdash/common';
import React, { FC } from 'react';
import { useSpaces } from '../../../hooks/useSpaces';
import ActionCardList from '../../common/ActionCardList';
import SpaceForm from './SpaceForm';

const SpaceBrowser: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isLoading } = useSpaces(projectUuid);

    if (isLoading || data === undefined) {
        return (
            <div style={{ marginTop: '20px' }}>
                <NonIdealState title="Loading charts" icon={<Spinner />} />
            </div>
        );
    }

    const dataList = data.map((space) => {
        const lastUpdatedChart = space.queries.reduce((acc, chart) =>
            chart && acc.updatedAt < chart.updatedAt ? acc : chart,
        );

        return {
            name: space.name,
            uuid: space.uuid,
            updatedAt: lastUpdatedChart.updatedAt,
            updatedByUser: lastUpdatedChart.updatedByUser,
        };
    });
    return (
        <>
            <ActionCardList
                title="Browser spaces"
                // useUpdate={useUpdateMutation}
                // useDelete={useDeleteMutation()}
                dataList={dataList}
                getURL={(space: Space) => {
                    return `/projects/${projectUuid}/spaces/${space.uuid}`;
                }}
                ModalContent={SpaceForm}
            />
        </>
    );
};

export default SpaceBrowser;
