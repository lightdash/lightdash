import { TableCalculation } from '@lightdash/common';
import React, { FC } from 'react';
import { useExplorerContext } from '../../providers/ExplorerProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import TableCalculationModal from './TableCalculationModal';

interface CreateTableCalculationModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const CreateTableCalculationModal: FC<CreateTableCalculationModalProps> = ({
    isOpen,
    onClose,
}) => {
    const addTableCalculation = useExplorerContext(
        (context) => context.actions.addTableCalculation,
    );
    const { track } = useTracking();
    const onCreate = (value: TableCalculation) => {
        addTableCalculation(value);
        track({
            name: EventName.CREATE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    };

    return (
        <TableCalculationModal
            isOpen={isOpen}
            isDisabled={false}
            onSave={onCreate}
            onClose={onClose}
        />
    );
};

export default CreateTableCalculationModal;
