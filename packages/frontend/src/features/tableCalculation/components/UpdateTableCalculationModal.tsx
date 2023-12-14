import { TableCalculation } from '@lightdash/common';
import { ModalProps } from '@mantine/core';
import { FC } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import TableCalculationModal from './TableCalculationModal';

type Props = ModalProps & {
    tableCalculation: TableCalculation;
};

export const UpdateTableCalculationModal: FC<Props> = ({
    opened,
    tableCalculation,
    onClose,
}) => {
    const updateTableCalculation = useExplorerContext(
        (context) => context.actions.updateTableCalculation,
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
            opened={opened}
            tableCalculation={tableCalculation}
            onSave={onUpdate}
            onClose={onClose}
        />
    );
};
