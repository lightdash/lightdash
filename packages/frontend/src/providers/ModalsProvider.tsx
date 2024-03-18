import { assertUnreachable } from '@lightdash/common';
import { Box, Button, Group, Stack, Title } from '@mantine/core';
import {
    ModalsProvider as MantineModalsProvider,
    type ContextModalProps,
} from '@mantine/modals';
import { IconTrash } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import MantineIcon from '../components/common/MantineIcon';

export enum ModalIntents {
    Delete = 'Delete',
}

export const DeleteModal = ({
    innerProps,
}: ContextModalProps<{
    modalBody: string;
    onClose: () => void;
    onConfirm: () => void;
    onConfirmIsLoading: boolean;
}>) => (
    <Stack spacing="lg" pt="sm">
        <Box>{innerProps.modalBody}</Box>
        <Group position="right" mt="sm">
            <Button color="dark" variant="outline" onClick={innerProps.onClose}>
                Cancel
            </Button>

            <Button
                loading={innerProps.onConfirmIsLoading}
                color="red"
                onClick={innerProps.onConfirm}
            >
                Delete
            </Button>
        </Group>
    </Stack>
);

export const ModalTitle = ({
    intent,
    children,
}: {
    intent: ModalIntents;
    children: ReactNode;
}) => {
    switch (intent) {
        case ModalIntents.Delete:
            return (
                <Group spacing="xs">
                    <MantineIcon icon={IconTrash} color="red" size="lg" />
                    <Title order={4}>{children}</Title>
                </Group>
            );
        default:
            assertUnreachable(intent, `Unknown modal intent: ${intent}`);
            break;
    }
    return <Title order={4}>{children}</Title>;
};

export const ModalsProvider = ({ children }: { children: ReactNode }) => {
    return (
        <MantineModalsProvider
            modals={{
                [ModalIntents.Delete]: DeleteModal /* ...other modals */,
            }}
            modalProps={{
                withinPortal: true,
            }}
        >
            {children}
        </MantineModalsProvider>
    );
};
