import {
    Box,
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
     * Enable fullscreen mode. The modal will take up nearly the entire viewport.
     * Useful for data viewers, tables, or content that needs maximum space.
     * When enabled, the body will fill available height without ScrollArea constraints.
     * @default false
     */
    fullScreen?: boolean;
    /**
     * Whether to show the close button in the header.
     * @default true
     */
    withCloseButton?: boolean;
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
     * Action buttons to display in the header (right side, before close button).
     * Useful for fullscreen modals with export buttons, links, etc.
     */
    headerActions?: React.ReactNode;
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
    fullScreen = false,
    withCloseButton = true,
    description,
    children,
    actions,
    leftActions,
    headerActions,
    cancelLabel = 'Cancel',
    cancelDisabled = false,
    onCancel,
    modalRootProps,
    modalHeaderProps,
    modalBodyProps,
    modalActionsProps,
}) => {
    const renderBody = () => {
        if (fullScreen) {
            // Fullscreen mode: no ScrollArea, body fills available space
            return (
                <Modal.Body p={0} className={classes.fullScreenBody}>
                    <Box
                        px={modalBodyProps?.px ?? 'xl'}
                        py={modalBodyProps?.py ?? 'md'}
                        h="100%"
                    >
                        {description && <Text fz="sm">{description}</Text>}
                        {children}
                    </Box>
                </Modal.Body>
            );
        }

        // Standard mode: ScrollArea with max height
        return (
            <Modal.Body p={0} className={classes.body}>
                <ScrollArea.Autosize mah="calc(80vh - 140px)">
                    <Stack
                        gap="md"
                        px={modalBodyProps?.px ?? 'xl'}
                        py={modalBodyProps?.py ?? 'md'}
                        {...(modalBodyProps?.bg
                            ? { bg: modalBodyProps.bg }
                            : {})}
                        mah={modalBodyProps?.mah}
                        mih={modalBodyProps?.mih}
                    >
                        {description && <Text fz="sm">{description}</Text>}
                        {children}
                    </Stack>
                </ScrollArea.Autosize>
            </Modal.Body>
        );
    };

    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            size={fullScreen ? 'auto' : size}
            centered
            {...modalRootProps}
        >
            <Modal.Overlay />
            <Modal.Content
                className={fullScreen ? classes.fullScreenContent : undefined}
            >
                <Modal.Header
                    className={classes.header}
                    px="xl"
                    py="md"
                    {...modalHeaderProps}
                >
                    <Group gap="sm" flex={1} wrap="nowrap" align="flex-start">
                        {icon ? (
                            <Paper p="6px" withBorder radius="md">
                                <MantineIcon icon={icon} size="md" />
                            </Paper>
                        ) : null}
                        <Text c="ldDark.9" fw={700} fz="md" lh="28px">
                            {title}
                        </Text>
                    </Group>
                    {headerActions ? (
                        <Group gap="sm" mr="md">
                            {headerActions}
                        </Group>
                    ) : null}
                    {withCloseButton && <Modal.CloseButton />}
                </Modal.Header>

                {renderBody()}

                {(actions || leftActions) && !fullScreen ? (
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
