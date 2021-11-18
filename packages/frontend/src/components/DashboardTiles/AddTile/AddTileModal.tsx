import { Dashboard, DashboardTileTypes } from 'common';
import React, { FC, useState } from 'react';
import { v4 as uuid4 } from 'uuid';
import ActionModal, { ActionTypeModal } from '../../common/modal/ActionModal';
import ChartTileForm from './ChartTileForm';
import MarkdownTileForm from './MarkdownTileForm';

type Props = {
    onAddTile: (tile: Dashboard['tiles'][number]) => void;
    type: DashboardTileTypes;
    onClose: () => void;
};

const getFormComponent = (type: DashboardTileTypes) => {
    switch (type) {
        case DashboardTileTypes.SAVED_CHART:
            return ChartTileForm;
        case DashboardTileTypes.MARKDOWN:
            return MarkdownTileForm;
        case DashboardTileTypes.LOOM:
            return MarkdownTileForm;
        default: {
            const never: never = type;
            throw new Error('Tile type not supported');
        }
    }
};

const AddTileModal: FC<Props> = ({ onClose, onAddTile, type }) => {
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
            h: 3,
            w: 5,
            x: 0,
            y: 0,
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

export default AddTileModal;
