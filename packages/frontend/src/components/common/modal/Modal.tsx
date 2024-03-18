import {
    Button,
    Group,
    Modal,
    Stack,
    Title,
    type ButtonProps,
    type ModalProps,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import React, { type FC, type ReactNode } from 'react';
import MantineIcon from '../MantineIcon';

export enum Intent {
    INFO = 'info',
    DELETE = 'delete',
}

interface CommonModalProps extends ModalProps {
    title: ReactNode;
    leftTitleIcon?: ReactNode;
    intent?: Intent;
    onConfirm?: () => void;
    confirmText?: string;
    confirmButtonProps?: ButtonProps &
        React.ButtonHTMLAttributes<HTMLButtonElement>;
    children?: ReactNode;
}

const CommonModal: FC<CommonModalProps> = ({
    size = 'lg',
    title,
    leftTitleIcon,
    intent = Intent.INFO,
    onConfirm,
    confirmButtonProps = {},
    confirmText = 'Confirm',
    opened,
    onClose,
    children,
}) => {
    const isDeleteIntent = intent === 'delete';

    return (
        <>
            <Modal.Root
                size={size}
                opened={opened}
                onClose={onClose}
                withinPortal
                styles={(theme) => ({
                    header: {
                        borderBottom: `1px solid ${theme.colors.gray[3]}`,
                    },
                    body: { padding: 0 },
                })}
            >
                <Modal.Overlay />
                <Modal.Content>
                    <Modal.Header>
                        <Modal.Title>
                            <Group spacing="xs">
                                {isDeleteIntent && (
                                    <MantineIcon
                                        icon={IconTrash}
                                        color="red"
                                        size="lg"
                                    />
                                )}
                                {leftTitleIcon}
                                <Title order={4}>{title}</Title>
                            </Group>
                        </Modal.Title>
                        <Modal.CloseButton />
                    </Modal.Header>
                    <Modal.Body>
                        <Stack spacing="lg" p="md" pb="xl">
                            {children}
                        </Stack>
                        <Group
                            position="right"
                            sx={(theme) => ({
                                borderTop: `1px solid ${theme.colors.gray[3]}`,
                                bottom: 0,
                                padding: theme.spacing.sm,
                            })}
                        >
                            <Button
                                color="dark"
                                variant="outline"
                                size="xs"
                                onClick={onClose}
                            >
                                Cancel
                            </Button>
                            {isDeleteIntent && (
                                <Button
                                    color="red"
                                    size="xs"
                                    onClick={onConfirm}
                                >
                                    Delete
                                </Button>
                            )}
                            {!isDeleteIntent && (
                                <Button size="xs" {...confirmButtonProps}>
                                    {confirmText}
                                </Button>
                            )}
                        </Group>
                    </Modal.Body>
                </Modal.Content>
            </Modal.Root>
        </>
    );
};

export default CommonModal;
