import React, { useState } from 'react';
import { NonIdealState } from '@blueprintjs/core';
import { SpaceQuery, ApiError, Dashboard } from 'common';
import { UseMutationResult } from 'react-query';
import { UseFormReturn } from 'react-hook-form';
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
    ModalForm: (
        props: Pick<ActionModalProps, 'actionState' | 'isDisabled'>,
    ) => JSX.Element;
};

const ActionCardList = (props: ActionCardListProps) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: any;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });
    const { dataList, getURL, useDelete, useUpdate, setFormValues, ModalForm } =
        props;

    return (
        <div
            style={{
                padding: '20px',
                flexGrow: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'flex-start',
                alignItems: 'stretch',
            }}
        >
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
                    useActionState={[actionState, setActionState]}
                    useUpdate={useUpdate}
                    setFormValues={setFormValues}
                    ModalForm={ModalForm}
                />
            )}
            {actionState.actionType === ActionTypeModal.DELETE && (
                <DeleteActionModal
                    useActionState={[actionState, setActionState]}
                    useDelete={useDelete}
                    setFormValues={setFormValues}
                    ModalForm={ModalForm}
                />
            )}

            {dataList.length <= 0 && (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState title="No results available" icon="search" />
                </div>
            )}
        </div>
    );
};
export default ActionCardList;
