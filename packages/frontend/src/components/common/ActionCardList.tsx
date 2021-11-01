import React, { useState } from 'react';
import {
    Card,
    Colors,
    HTMLTable,
    NonIdealState,
    H4,
    H3,
    Divider,
} from '@blueprintjs/core';
import { ApiError } from 'common';
import { UseMutationResult } from 'react-query';
import styled from 'styled-components';
import { ActionModalProps, ActionTypeModal } from './modal/ActionModal';
import ActionCard from './ActionCard';
import UpdateActionModal from './modal/UpdateActionModal';
import DeleteActionModal from './modal/DeleteActionModal';

type ActionCardListProps<T extends { uuid: string; name: string }> = {
    title: string;
    dataList: T[];
    getURL: (data: T) => string;
    useDelete: UseMutationResult<undefined, ApiError, string>;
    useUpdate: (id: string) => UseMutationResult<any, ApiError, any>;
    ModalContent: (
        props: Pick<ActionModalProps<T>, 'useActionModalState' | 'isDisabled'>,
    ) => JSX.Element;
    headerAction?: React.ReactNode;
};

const ActionCardListWrapper = styled(Card)`
    width: 768px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
`;

const ActionCardList = <T extends { uuid: string; name: string }>({
    dataList,
    getURL,
    useDelete,
    useUpdate,
    ModalContent,
    title,
    headerAction,
}: ActionCardListProps<T>) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: T;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });

    return (
        <ActionCardListWrapper>
            <div
                style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-end',
                }}
            >
                <H3 style={{ flex: 1, margin: 0, color: Colors.GRAY1 }}>
                    {title}
                </H3>
                {headerAction}
            </div>
            <Divider style={{ margin: '20px 0' }} />
            <div>
                {dataList.map((data) => (
                    <div key={data.uuid} style={{ marginBottom: 10 }}>
                        <ActionCard
                            data={data}
                            url={getURL(data)}
                            setActionState={setActionState}
                        />
                    </div>
                ))}
            </div>
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

ActionCardList.defaultProps = {
    headerAction: null,
};

export default ActionCardList;
