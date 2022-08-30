import { TableCalculation } from '@lightdash/common';
import React, { FC } from 'react';
import { useContextSelector } from 'use-context-selector';
import { Context } from '../../providers/ExplorerProvider';
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
    const updateTableCalculation = useContextSelector(
        Context,
        (context) => context!.actions.updateTableCalculation,
    );
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
