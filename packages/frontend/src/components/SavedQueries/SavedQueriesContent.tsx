import React from 'react';
import { SpaceQuery } from 'common';
import ActionCardList from '../common/ActionCardList';
import {
    useDeleteMutation,
    useUpdateMutation,
} from '../../hooks/useSavedQuery';
import SavedQueryForm from './SavedQueryForm';

type SavedQueriesContentProps = {
    savedQueries: SpaceQuery[];
    projectUuid: string;
};

const SavedQueriesContent = ({
    savedQueries,
    projectUuid,
}: SavedQueriesContentProps) => (
    <ActionCardList
        useUpdate={useUpdateMutation}
        useDelete={useDeleteMutation()}
        dataList={savedQueries}
        getURL={(savedQuery: SpaceQuery) => {
            const { uuid } = savedQuery;
            return `/projects/${projectUuid}/saved/${uuid}`;
        }}
        ModalContent={SavedQueryForm}
    />
);

export default SavedQueriesContent;
