import { TableCalculation } from '@lightdash/common';
import { ModalProps } from '@mantine/core';
import { FC } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';
import TableCalculationModal from './TableCalculationModal';

type Props = ModalProps & {
    opened: boolean;
    onClose: () => void;
};

export const CreateTableCalculationModal: FC<Props> = ({ opened, onClose }) => {
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
            opened={opened}
            onSave={onCreate}
            onClose={onClose}
        />
    );
};
