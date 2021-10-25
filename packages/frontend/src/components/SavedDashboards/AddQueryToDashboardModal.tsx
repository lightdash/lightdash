import React, { useState } from 'react';
import { Intent } from '@blueprintjs/core';
import { SavedQuery } from 'common';
import { useParams } from 'react-router-dom';
import GenericActionModal from '../common/modal/GenericActionModal';
import AddQueryToDashboardForm from './AddQueryToDashboardForm';
import { useCreateUpdateDashboardWithQuery } from '../../hooks/useSavedQueryAndDashboard';

type AddQueryToDashboardModalProps = {
    isOpen: boolean;
    queryData: Omit<SavedQuery, 'uuid' | 'name'> | undefined;
    savedQueryUuid?: string;
};

const AddQueryToDashboardModal = ({
    isOpen,
    queryData,
    savedQueryUuid,
}: AddQueryToDashboardModalProps) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const useDB = useCreateUpdateDashboardWithQuery();
    const { isLoading: isMutating, reset, status, mutate } = useDB;

    return (
        <GenericActionModal
            title="Add query to dashboard"
            confirmButtonLabel="Add"
            isOpen={isOpen}
            onSubmit={(dataForm) => {}}
            useDB={useDB}
            ModalContent={AddQueryToDashboardForm}
        />
    );
};

AddQueryToDashboardModal.defaultProps = {
    savedQueryUuid: '',
};
