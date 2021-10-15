import React from 'react';
import { SpaceQuery } from 'common';
import { UseFormReturn } from 'react-hook-form';
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
}: SavedQueriesContentProps) => {
    const useDelete = useDeleteMutation();
    const useUpdate = useUpdateMutation;
    const getURL = (savedQuery: any | undefined) => {
        const { uuid } = savedQuery;
        return `/projects/${projectUuid}/saved/${uuid}`;
    };
    return (
        <ActionCardList
            useUpdate={useUpdate}
            useDelete={useDelete}
            dataList={savedQueries}
            setFormValues={(data: any, methods: UseFormReturn<any, object>) => {
                const { setValue } = methods;
                if (data?.name) {
                    setValue('name', data?.name);
                }
            }}
            getURL={getURL}
            ModalForm={SavedQueryForm}
        />
    );
};

export default SavedQueriesContent;
