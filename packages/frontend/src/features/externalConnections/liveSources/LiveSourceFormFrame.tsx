import { Button, Group, Stack } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import MantineModal from '../../../components/common/MantineModal';

type Props = {
    /** Inline renders the form in place, such as in a source's settings. */
    inline?: boolean;
    opened: boolean;
    onClose: () => void;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
    confirmLoading?: boolean;
    confirmDisabled?: boolean;
    cancelDisabled?: boolean;
    children: ReactNode;
};

/** A live data source's form: in its own modal, or inline with Save changes, which edits only. */
export const LiveSourceFormFrame: FC<Props> = ({
    inline = false,
    opened,
    onClose,
    title,
    confirmLabel,
    onConfirm,
    confirmLoading,
    confirmDisabled,
    cancelDisabled,
    children,
}) =>
    inline ? (
        <Stack gap="sm">
            {children}
            <Group justify="flex-end">
                <Button
                    loading={confirmLoading}
                    disabled={confirmDisabled}
                    onClick={onConfirm}
                >
                    Save changes
                </Button>
            </Group>
        </Stack>
    ) : (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title}
            confirmLabel={confirmLabel}
            onConfirm={onConfirm}
            confirmLoading={confirmLoading}
            confirmDisabled={confirmDisabled}
            cancelDisabled={cancelDisabled}
        >
            {children}
        </MantineModal>
    );
