import { TableCalculation } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    ModalProps,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { FC } from 'react';
import { useExplorerContext } from '../../../providers/ExplorerProvider';
import { useTracking } from '../../../providers/TrackingProvider';
import { EventName } from '../../../types/Events';

type Props = Pick<ModalProps, 'onClose'> & {
    tableCalculation: TableCalculation;
};

export const DeleteTableCalculationModal: FC<Props> = ({
    tableCalculation,
    onClose,
}) => {
    const deleteTableCalculation = useExplorerContext(
        (context) => context.actions.deleteTableCalculation,
    );
    const { track } = useTracking();

    const onConfirm = () => {
        deleteTableCalculation(tableCalculation.name);
        track({
            name: EventName.CONFIRM_DELETE_TABLE_CALCULATION_BUTTON_CLICKED,
        });
        onClose();
    };
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
