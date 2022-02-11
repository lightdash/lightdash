import { Dashboard, DashboardTileTypes, getDefaultChartTileSize } from 'common';
import React, { FC, useState } from 'react';
import { v4 as uuid4 } from 'uuid';
import ActionModal, { ActionTypeModal } from '../../common/modal/ActionModal';
import ChartTileForm from './ChartTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';

const getFormComponent = (type: DashboardTileTypes) => {
    switch (type) {
        case DashboardTileTypes.SAVED_CHART:
            return ChartTileForm;
        case DashboardTileTypes.MARKDOWN:
            return MarkdownTileForm;
        case DashboardTileTypes.LOOM:
            return LoomTileForm;
        default: {
            const never: never = type;
            throw new Error('Tile type not supported');
        }
    }
};

type EditProps<T = Dashboard['tiles'][number]> = {
    onSubmit: (tile: T) => void;
    tile: T;
    onClose: () => void;
};

export const TileModal = <T extends Dashboard['tiles'][number]>({
    onClose,
    onSubmit,
    tile,
}: EditProps<T>) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: any;
    }>({
        actionType: ActionTypeModal.UPDATE,
        data: tile.properties,
    });
    const [completedMutation, setCompletedMutation] = useState(false);

    const onSubmitForm = (
        properties: Dashboard['tiles'][number]['properties'],
    ) => {
        setCompletedMutation(true);
        onSubmit({
            ...tile,
            properties: properties as any,
        });
    };

    return (
        <ActionModal
            title="Edit tile"
            confirmButtonLabel="Save"
            useActionModalState={[actionState, setActionState]}
            isDisabled={false}
            onSubmitForm={onSubmitForm}
            completedMutation={completedMutation}
            ModalContent={getFormComponent(tile.type)}
            onClose={onClose}
        />
    );
};

type AddProps = {
    onAddTile: (tile: Dashboard['tiles'][number]) => void;
    type: DashboardTileTypes;
    onClose: () => void;
};

export const AddTileModal: FC<AddProps> = ({ onClose, onAddTile, type }) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: any;
    }>({
        actionType: ActionTypeModal.UPDATE,
    });
    const [completedMutation, setCompletedMutation] = useState(false);

    const onSubmitForm = (
        properties: Dashboard['tiles'][number]['properties'],
    ) => {
        setCompletedMutation(true);
        onAddTile({
            uuid: uuid4(),
            properties: properties as any,
            type,
            ...getDefaultChartTileSize(undefined), // requires a fetch to know chart type
        });
    };

    return (
        <ActionModal
            title="Add tile to dashboard"
            confirmButtonLabel="Add"
            useActionModalState={[actionState, setActionState]}
            isDisabled={false}
            onSubmitForm={onSubmitForm}
            completedMutation={completedMutation}
            ModalContent={getFormComponent(type)}
            onClose={onClose}
        />
    );
};
