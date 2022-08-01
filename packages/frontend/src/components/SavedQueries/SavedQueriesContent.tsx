import { SpaceQuery } from '@lightdash/common';
import React from 'react';
import {
    useDeleteMutation,
    useUpdateMutation,
} from '../../hooks/useSavedQuery';
import ActionCardList from '../common/ActionCardList';
import SavedQueryForm from './SavedQueryForm';

type SavedQueriesContentProps = {
    savedQueries: SpaceQuery[];
    projectUuid: string;
    title: string;
};

const SavedQueriesContent = ({
    savedQueries,
    projectUuid,
    title,
}: SavedQueriesContentProps) => {
    const orderedCharts = savedQueries.sort(
        (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
    return (
        <ActionCardList
            title={title}
            useUpdate={useUpdateMutation}
            useDelete={useDeleteMutation()}
            dataList={orderedCharts}
            getURL={(savedQuery: SpaceQuery) => {
                const { uuid } = savedQuery;
                return `/projects/${projectUuid}/saved/${uuid}`;
            }}
            ModalContent={SavedQueryForm}
            isChart
        />
    );
};

export default SavedQueriesContent;
