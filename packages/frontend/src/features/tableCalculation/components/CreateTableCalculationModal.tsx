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
    opened: boolean;
    onClose: () => void;
};

export const CreateTableCalculationModal: FC<Props> = ({ opened, onClose }) => {
    const dispatch = useExplorerDispatch();
    const { track } = useTracking();

    const onCreate = useCallback(
        (value: TableCalculation) => {
            dispatch(explorerActions.addTableCalculation(value));
            track({
                name: EventName.CREATE_TABLE_CALCULATION_BUTTON_CLICKED,
            });
            onClose();
        },
        [dispatch, track, onClose],
    );

    return (
        <TableCalculationModal
            opened={opened}
            onSave={onCreate}
            onClose={onClose}
        />
    );
};
