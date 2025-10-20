import { type TableCalculation } from '@lightdash/common';
import { type ModalProps } from '@mantine/core';
import { useCallback, type FC } from 'react';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import useTracking from '../../../providers/Tracking/useTracking';
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
    const dispatch = useExplorerDispatch();
    const { track } = useTracking();

    const onUpdate = useCallback(
        (value: TableCalculation) => {
            dispatch(
                explorerActions.updateTableCalculation({
                    oldName: tableCalculation.name,
                    tableCalculation: value,
                }),
            );
            track({
                name: EventName.UPDATE_TABLE_CALCULATION_BUTTON_CLICKED,
            });
            onClose();
        },
        [dispatch, tableCalculation.name, track, onClose],
    );

    return (
        <TableCalculationModal
            opened={opened}
            tableCalculation={tableCalculation}
            onSave={onUpdate}
            onClose={onClose}
        />
    );
};
