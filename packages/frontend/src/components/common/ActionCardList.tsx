import React, { useState } from 'react';
import { NonIdealState } from '@blueprintjs/core';
import { SpaceQuery, ApiError, Dashboard } from 'common';
import { UseMutationResult } from 'react-query';
import { UseFormReturn } from 'react-hook-form';
import styled from 'styled-components';
import { ActionModalProps, ActionTypeModal } from './modal/ActionModalTypes';
import ActionCard from './ActionCard';
import UpdateActionModal from './modal/UpdateActionModal';
import DeleteActionModal from './modal/DeleteActionModal';

type ActionCardListProps = {
    dataList: Pick<SpaceQuery | Dashboard, 'uuid' | 'name'>[];
    getURL: (data: any) => string;
    useDelete: UseMutationResult<undefined, ApiError, string>;
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    setFormValues: (data: any, methods: UseFormReturn<any, object>) => void;
    ModalContent: (
        props: Pick<ActionModalProps, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
};

const ActionCardListWrapper = styled.div`
    padding: 20px;
    flex-grow: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    align-items: stretch;
`;

const ActionCardList = (props: ActionCardListProps) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: any;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });
    const {
        dataList,
        getURL,
        useDelete,
        useUpdate,
        setFormValues,
        ModalContent,
    } = props;

    return (
        <ActionCardListWrapper>
            {dataList.map((data) => (
                <ActionCard
                    data={data}
                    key={data.uuid}
                    url={getURL(data)}
                    setActionState={setActionState}
                />
            ))}
            {actionState.actionType === ActionTypeModal.UPDATE && (
                <UpdateActionModal
                    useActionModalState={[actionState, setActionState]}
                    useUpdate={useUpdate}
                    setFormValues={setFormValues}
                    ModalContent={ModalContent}
                />
            )}
            {actionState.actionType === ActionTypeModal.DELETE && (
                <DeleteActionModal
                    useActionModalState={[actionState, setActionState]}
                    useDelete={useDelete}
                    ModalContent={ModalContent}
                />
            )}

            {dataList.length <= 0 && (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState title="No results available" icon="search" />
                </div>
            )}
        </ActionCardListWrapper>
    );
};
export default ActionCardList;
