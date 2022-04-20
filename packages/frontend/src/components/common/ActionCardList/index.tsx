import { NonIdealState } from '@blueprintjs/core';
import { ApiError, UpdatedByUser } from 'common';
import React, { useState } from 'react';
import { UseMutationResult } from 'react-query';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import { DeleteDashboardModal } from '../../SavedDashboards/DeleteDashboardModal';
import ActionCard from '../ActionCard';
import { ActionModalProps, ActionTypeModal } from '../modal/ActionModal';
import UpdateActionModal from '../modal/UpdateActionModal';
import {
    ActionCardListWrapper,
    ActionCardWrapper,
    CardDivider,
    HeaderCardListWrapper,
    NoIdealStateWrapper,
    TitleWrapper,
} from './ActionCardList.style';

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
    isChart?: boolean;
    isHomePage?: boolean;
};

const ActionCardList = <
    T extends {
        uuid: string;
        name: string;
        updatedAt: Date;
        updatedByUser?: UpdatedByUser;
    },
>({
    dataList,
    getURL,
    useDelete,
    useUpdate,
    ModalContent,
    title,
    headerAction,
    isChart,
    isHomePage,
}: ActionCardListProps<T>) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: T;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });

    return (
        <ActionCardListWrapper $isHomePage={isHomePage}>
            {!isHomePage && (
                <HeaderCardListWrapper>
                    <TitleWrapper>{title}</TitleWrapper>
                    {headerAction}
                </HeaderCardListWrapper>
            )}
            {!isHomePage && <CardDivider />}
            <div>
                {dataList.map((data) => (
                    <ActionCardWrapper key={data.uuid}>
                        <ActionCard
                            data={data}
                            url={getURL(data)}
                            setActionState={setActionState}
                            isChart={isChart}
                        />
                    </ActionCardWrapper>
                ))}
            </div>
            {actionState.actionType === ActionTypeModal.UPDATE && (
                <UpdateActionModal
                    useActionModalState={[actionState, setActionState]}
                    useUpdate={useUpdate}
                    ModalContent={ModalContent}
                />
            )}
            {actionState.actionType === ActionTypeModal.DELETE &&
                actionState.data && (
                    <DeleteDashboardModal
                        isOpen={
                            actionState.actionType === ActionTypeModal.DELETE
                        }
                        onClose={() => {
                            setActionState({
                                actionType: ActionTypeModal.CLOSE,
                            });
                        }}
                        uuid={actionState.data.uuid}
                        name={actionState.data.name}
                    />
                )}

            {actionState.actionType === ActionTypeModal.ADD_TO_DASHBOARD && (
                <AddTilesToDashboardModal
                    savedChart={actionState.data}
                    isOpen={
                        actionState.actionType ===
                        ActionTypeModal.ADD_TO_DASHBOARD
                    }
                    onClose={() =>
                        setActionState({ actionType: ActionTypeModal.CLOSE })
                    }
                />
            )}

            {dataList.length <= 0 && (
                <NoIdealStateWrapper>
                    <NonIdealState title="No results available" icon="search" />
                </NoIdealStateWrapper>
            )}
        </ActionCardListWrapper>
    );
};

ActionCardList.defaultProps = {
    headerAction: null,
    isChart: false,
    isHomePage: false,
};

export default ActionCardList;
