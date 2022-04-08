import { SpaceQuery } from 'common';
import React from 'react';
import {
    useDeleteMutation,
    useDuplicateMutation,
    useUpdateMutation,
} from '../../hooks/useSavedQuery';
import ActionCardList from '../common/ActionCardList';
import SavedQueryForm from './SavedQueryForm';

type SavedQueriesContentProps = {
    savedQueries: SpaceQuery[];
    projectUuid: string;
    isChart?: boolean;
};

const SavedQueriesContent = ({
    savedQueries,
    projectUuid,
    isChart,
}: SavedQueriesContentProps) => (
    <ActionCardList
        title="Saved charts"
        useUpdate={useUpdateMutation}
        useDelete={useDeleteMutation()}
        useDuplicate={useDuplicateMutation}
        dataList={savedQueries}
        getURL={(savedQuery: SpaceQuery) => {
            const { uuid } = savedQuery;
            return `/projects/${projectUuid}/saved/${uuid}`;
        }}
        ModalContent={SavedQueryForm}
        isChart={isChart}
    />
);

export default SavedQueriesContent;
