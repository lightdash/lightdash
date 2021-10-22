import React, { useState } from 'react';
import { Card, Colors, HTMLTable, NonIdealState } from '@blueprintjs/core';
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
    // eslint-disable-next-line react/require-default-props
    extra?: React.ReactNode;
};

const ActionCardListWrapper = styled(Card)`
    width: 768px;
    padding: 20px 40px;
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
    extra = null,
}: ActionCardListProps<T>) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: T;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });

    return (
        <ActionCardListWrapper>
            <HTMLTable>
                <thead>
                    <th
                        style={{
                            color: Colors.GRAY1,
                            width: '100%',
                            display: 'flex',
                            alignItems: 'flex-end',
                        }}
                    >
                        <span style={{ flex: 1 }}>{title}</span>
                        {extra}
                    </th>
                </thead>
                <tbody>
                    {dataList.map((data) => (
                        <tr key={data.uuid}>
                            <td>
                                <ActionCard
                                    data={data}
                                    url={getURL(data)}
                                    setActionState={setActionState}
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </HTMLTable>
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
