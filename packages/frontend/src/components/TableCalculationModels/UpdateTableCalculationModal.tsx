import { TableCalculation } from '@lightdash/common';
import { FC } from 'react';
import { useExplorer } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import TableCalculationModal from './TableCalculationModal';

interface UpdateTableCalculationModalProps {
    isOpen: boolean;
    tableCalculation: TableCalculation;
    onClose: () => void;
}

const UpdateTableCalculationModal: FC<UpdateTableCalculationModalProps> = ({
    isOpen,
    tableCalculation,
    onClose,
}) => {
    const {
        actions: { updateTableCalculation },
    } = useExplorer();
    const { track } = useTracking();
    const onUpdate = (value: TableCalculation) => {
        updateTableCalculation(tableCalculation.name, value);
        track({
            name: EventName.UPDATE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    };

    return (
        <TableCalculationModal
            isOpen={isOpen}
            isDisabled={false}
            tableCalculation={tableCalculation}
            onSave={onUpdate}
            onClose={onClose}
        />
    );
};

export default UpdateTableCalculationModal;
