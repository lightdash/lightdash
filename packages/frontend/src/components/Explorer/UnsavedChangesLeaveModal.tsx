import { Button, Text } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineModal from '../common/MantineModal';

type Props = {
    /** What would be lost by leaving. */
    unsaved: 'chart' | 'dashboard';
    onStay: () => void;
    onLeave: () => void;
};

export const UnsavedChangesLeaveModal: FC<Props> = ({
    unsaved,
    onStay,
    onLeave,
}) => (
    <MantineModal
        opened
        onClose={onStay}
        role="alertdialog"
        title="Unsaved changes"
        icon={IconAlertCircle}
        cancelLabel="Stay"
        actions={
            <Button color="red" onClick={onLeave}>
                Leave
            </Button>
        }
    >
        <Text fw={500}>
            You have unsaved changes to your {unsaved}! Are you sure you want to
            leave without saving?
        </Text>
    </MantineModal>
);
