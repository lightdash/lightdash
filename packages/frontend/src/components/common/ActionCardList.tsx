import React, { useState } from 'react';
import { NonIdealState } from '@blueprintjs/core';
import {
    SpaceQuery,
    ActionTypeModal,
    ApiError,
    ActionModalProps,
} from 'common';
import { UseMutationResult } from 'react-query';
import { UseFormReturn } from 'react-hook-form';
import ActionCard from './ActionCard';
import UpdateDeleteActionModal from './modal/UpdateDeleteActionModal';

type ActionCardListProps = {
    dataList: Pick<SpaceQuery, 'uuid' | 'name'>[];
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
            <UpdateDeleteActionModal
                useActionState={[actionState, setActionState]}
                useDelete={useDelete}
                useUpdate={useUpdate}
                setFormValues={setFormValues}
                ModalForm={ModalForm}
            />
            {dataList.length <= 0 && (
                <div style={{ padding: '50px 0' }}>
                    <NonIdealState title="No results available" icon="search" />
                </div>
            )}
        </div>
    );
};
export default ActionCardList;
