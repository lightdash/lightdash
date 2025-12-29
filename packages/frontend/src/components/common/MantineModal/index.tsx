import {
    Button,
    Flex,
    type FlexProps,
    Group,
    Modal,
    type ModalBodyProps,
    type ModalContentProps,
    type ModalHeaderProps,
    type ModalRootProps,
    Paper,
    ScrollArea,
    Stack,
    Text,
} from '@mantine-8/core';
import { type Icon as IconType } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../MantineIcon';
import classes from './MantineModal.module.css';

export type MantineModalProps = {
    opened: boolean;
    onClose: () => void;
    title: string;
    icon?: IconType;
    /**
     * Modal size. Accepts Mantine's built-in sizes ('xs', 'sm', 'md', 'lg', 'xl') or a custom number/string.
     * @default 'lg'
     */
    size?: ModalRootProps['size'];
    /**
     * Simple text description for the modal body.
     * Use this for simple confirmation dialogs instead of children.
     * Renders above children if both are provided.
     */
    description?: string;
    /**
     * Modal body content. Optional if `description` is provided.
     */
    children?: React.ReactNode;
    /**
     * Action buttons to display in the footer (right side).
     * A Cancel button is automatically prepended unless `cancelLabel` is set to `false`.
     */
    actions?: React.ReactNode;
    /**
     * Optional action buttons to display on the left side of the footer.
     * Useful for secondary actions like "New Space" or "Add" buttons.
     */
    leftActions?: React.ReactNode;
    /**
     * Label for the cancel button. Set to `false` to hide the cancel button.
     * @default "Cancel"
     */
    cancelLabel?: string | false;
    /**
     * Whether the cancel button is disabled.
     * Useful when you want to prevent cancellation during async operations.
     * @default false
     */
    cancelDisabled?: boolean;
    /**
     * Custom handler for the cancel button. If not provided, defaults to `onClose`.
     * Useful when cancel should do something different (e.g., go back to a previous step).
     */
    onCancel?: () => void;
    modalRootProps?: Partial<ModalRootProps>;
    modalContentProps?: Partial<ModalContentProps>;
    modalHeaderProps?: Partial<ModalHeaderProps>;
    modalBodyProps?: Partial<ModalBodyProps>;
    modalActionsProps?: Partial<FlexProps>;
};

const MantineModal: React.FC<MantineModalProps> = ({
    opened,
    onClose,
    title,
    icon,
    size = 'lg',
    description,
    children,
    actions,
    leftActions,
    cancelLabel = 'Cancel',
    cancelDisabled = false,
    onCancel,
    modalRootProps,
    modalHeaderProps,
    modalBodyProps,
    modalActionsProps,
}) => {
    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            size={size}
            centered
            {...modalRootProps}
        >
            <Modal.Overlay />
            <Modal.Content>
                <Modal.Header
                    className={classes.header}
                    px="xl"
                    py="md"
                    {...modalHeaderProps}
                >
                    <Group gap="sm">
                        {icon ? (
                            <Paper p="6px" withBorder radius="md">
                                <MantineIcon icon={icon} size="md" />
                            </Paper>
                        ) : null}
                        <Text c="ldDark.9" fw={700} fz="md">
                            {title}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body p={0} className={classes.body}>
                    <ScrollArea.Autosize
                        mah="calc(80vh - 140px)"
                        offsetScrollbars
                    >
                        <Stack
                            gap="md"
                            px={modalBodyProps?.px ?? 'xl'}
                            py={modalBodyProps?.py ?? 'md'}
                        >
                            {description && <Text fz="sm">{description}</Text>}
                            {children}
                        </Stack>
                    </ScrollArea.Autosize>
                </Modal.Body>
                {actions || leftActions ? (
                    <Flex
                        className={classes.actions}
                        px="xl"
                        py="md"
                        justify={leftActions ? 'space-between' : 'flex-end'}
                        align="center"
                        {...modalActionsProps}
                    >
                        {leftActions ?? <div />}
                        <Group gap="sm">
                            {cancelLabel !== false && (
                                <Button
                                    variant="default"
                                    onClick={onCancel ?? onClose}
                                    disabled={cancelDisabled}
                                >
                                    {cancelLabel}
                                </Button>
                            )}
                            {actions}
                        </Group>
                    </Flex>
                ) : null}
            </Modal.Content>
        </Modal.Root>
    );
};

export default MantineModal;
