import { type TableCalculation } from '@lightdash/common';
import { type ModalProps } from '@mantine-8/core';
import { useCallback, type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import {
    explorerActions,
    useExplorerDispatch,
} from '../../../features/explorer/store';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';

type Props = Pick<ModalProps, 'onClose'> & {
    tableCalculation: TableCalculation;
};

export const DeleteTableCalculationModal: FC<Props> = ({
    tableCalculation,
    onClose,
}) => {
    const dispatch = useExplorerDispatch();
    const { track } = useTracking();

    const handleConfirm = useCallback(() => {
        dispatch(explorerActions.deleteTableCalculation(tableCalculation.name));
        track({
            name: EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    }, [dispatch, tableCalculation.name, track, onClose]);

    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Delete Table Calculation"
            variant="delete"
            resourceType="table calculation"
            onConfirm={handleConfirm}
        />
    );
};
