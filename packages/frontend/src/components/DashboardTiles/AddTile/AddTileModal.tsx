import { DashboardChartTile, DashboardTileTypes } from 'common';
import React, { FC, useState } from 'react';
import { v4 as uuid4 } from 'uuid';
import ActionModal, { ActionTypeModal } from '../../common/modal/ActionModal';
import TileForm from './TileForm';

type Props = {
    onAddTile: (tile: DashboardChartTile) => void;
    onClose: () => void;
};

const AddTileModal: FC<Props> = ({ onClose, onAddTile }) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: DashboardChartTile['properties'];
    }>({
        actionType: ActionTypeModal.UPDATE,
    });
    const [completedMutation, setCompletedMutation] = useState(false);

    const onSubmitForm = (properties: DashboardChartTile['properties']) => {
        setCompletedMutation(true);
        onAddTile({
            uuid: uuid4(),
            properties,
            type: DashboardTileTypes.SAVED_CHART,
            h: 3,
            w: 5,
            x: 0,
            y: 0,
        });
    };

    return (
        <ActionModal
            title="Add chart to dashboard"
            confirmButtonLabel="Add"
            useActionModalState={[actionState, setActionState]}
            isDisabled={false}
            onSubmitForm={onSubmitForm}
            completedMutation={completedMutation}
            ModalContent={TileForm}
            onClose={onClose}
        />
    );
};

export default AddTileModal;
