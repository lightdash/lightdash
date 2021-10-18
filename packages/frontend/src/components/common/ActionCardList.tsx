import React, { useState } from 'react';
import { NonIdealState } from '@blueprintjs/core';
import { ApiError } from 'common';
import { UseMutationResult } from 'react-query';
import styled from 'styled-components';
import { ActionModalProps, ActionTypeModal } from './modal/ActionModal';
import ActionCard from './ActionCard';
import UpdateActionModal from './modal/UpdateActionModal';
import DeleteActionModal from './modal/DeleteActionModal';

type ActionCardListProps<T> = {
    dataList: T[];
    getURL: (data: T) => string;
    useDelete: UseMutationResult<undefined, ApiError, string>;
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    ModalContent: (
        props: Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>,
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

const ActionCardList = <T extends { uuid: string; name: string }>(
    props: ActionCardListProps<T>,
) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: T;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });
    const { dataList, getURL, useDelete, useUpdate, ModalContent } = props;

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
