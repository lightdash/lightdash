import { Button, InputGroup, NonIdealState } from '@blueprintjs/core';
import { ApiError, UpdatedByUser } from '@lightdash/common';
import Fuse from 'fuse.js';
import React, { useMemo, useState } from 'react';
import { UseMutationResult } from 'react-query';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import EmptySavedChartsState from '../../SavedQueries/EmptySavedChartsState';
import ActionCard from '../ActionCard';
import { ActionModalProps, ActionTypeModal } from '../modal/ActionModal';
import DeleteActionModal from '../modal/DeleteActionModal';
import MoveToSpaceModal from '../modal/MoveToSpaceModal';
import UpdateActionModal from '../modal/UpdateActionModal';
import {
    ActionCardListWrapper,
    ActionCardWrapper,
    CardDivider,
    HeaderCardListWrapper,
    NoIdealStateWrapper,
    SearchWrapper,
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
    const [search, setSearch] = useState('');
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: T;
    }>({
        actionType: ActionTypeModal.CLOSE,
    });

    const displaySearch = isChart && dataList.length >= 5 && !isHomePage;

    const filteredQueries = useMemo(() => {
        const validSearch = search ? search.toLowerCase() : '';
        if (dataList) {
            if (validSearch !== '') {
                return new Fuse(Object.values(dataList), {
                    keys: ['name'],
                    ignoreLocation: true,
                    threshold: 0.3,
                })
                    .search(validSearch)
                    .map((res) => res.item);
            }
            return Object.values(dataList);
        }
        return [];
    }, [dataList, search]);

    const itemsToDisplay = isChart ? filteredQueries : dataList;

    return (
        <ActionCardListWrapper $isHomePage={isHomePage}>
            {!isHomePage && (
                <HeaderCardListWrapper>
                    <TitleWrapper>{title}</TitleWrapper>
                    {headerAction}
                </HeaderCardListWrapper>
            )}
            {!isHomePage && <CardDivider />}
            {displaySearch && (
                <SearchWrapper>
                    <InputGroup
                        leftIcon="search"
                        rightElement={
                            <Button
                                minimal
                                icon="cross"
                                onClick={() => setSearch('')}
                            />
                        }
                        placeholder="Search saved charts"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </SearchWrapper>
            )}
            <div>
                {itemsToDisplay.map((data) => (
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
                    <DeleteActionModal
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
                        isChart={!!isChart}
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

            {actionState.actionType === ActionTypeModal.MOVE_TO_SPACE &&
                actionState.data && (
                    <MoveToSpaceModal
                        isOpen={
                            actionState.actionType ===
                            ActionTypeModal.MOVE_TO_SPACE
                        }
                        onClose={() =>
                            setActionState({
                                actionType: ActionTypeModal.CLOSE,
                            })
                        }
                        uuid={actionState.data.uuid}
                        isChart={!!isChart}
                    />
                )}

            {dataList.length <= 0 && (
                <NoIdealStateWrapper>
                    {isChart ? (
                        <EmptySavedChartsState />
                    ) : (
                        <NonIdealState
                            title="No results available"
                            icon="search"
                        />
                    )}
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
