import { type TableCalculation } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useCallback, type FC } from 'react';
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

    const onConfirm = useCallback(() => {
        dispatch(explorerActions.deleteTableCalculation(tableCalculation.name));
        track({
            name: EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    }, [dispatch, tableCalculation.name, track, onClose]);
    return (
        <Modal
            opened
            title={<Title order={4}>Delete Table Calculation</Title>}
            onClose={onClose}
        >
            <Stack spacing="lg" pt="sm">
                <Text>
                    Are you sure you want to delete this table calculation?
                </Text>

                <Group position="right" mt="sm">
                    <Button variant="outline" color="dark" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button color="red" onClick={onConfirm}>
                        Delete
                    </Button>
                </Group>
            </Stack>
        </Modal>
    );
};
