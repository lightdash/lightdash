import React, { FC, useState } from 'react';
import { Dashboard, DashboardChartTile, DashboardTileTypes } from 'common';
import ActionModal, { ActionTypeModal } from '../../common/modal/ActionModal';
import { useUpdateDashboard } from '../../../hooks/dashboard/useDashboard';
import TileForm from './TileForm';

type Props = {
    dashboard: Dashboard;
    onClose: () => void;
};

const AddTileModal: FC<Props> = ({ dashboard, onClose }) => {
    const [actionState, setActionState] = useState<{
        actionType: number;
        data?: DashboardChartTile['properties'];
    }>({
        actionType: ActionTypeModal.UPDATE,
    });
    const { mutate, isLoading, isSuccess } = useUpdateDashboard(dashboard.uuid);

    const onSubmitForm = (properties: DashboardChartTile['properties']) => {
        mutate({
            tiles: [
                ...dashboard.tiles,
                {
                    properties,
                    type: DashboardTileTypes.SAVED_CHART,
                    h: 300,
                    w: 500,
                    x: 0,
                    y: 0,
                },
            ],
        });
    };

    return (
        <ActionModal
            title="Add chart to dashboard"
            useActionModalState={[actionState, setActionState]}
            isDisabled={isLoading}
            onSubmitForm={onSubmitForm}
            completedMutation={isSuccess}
            ModalContent={TileForm}
            onClose={onClose}
        />
    );
};

export default AddTileModal;
