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
import { IconTrash, type Icon as IconType } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../MantineIcon';
import classes from './MantineModal.module.css';

/**
 * Modal variants for common action patterns.
 * - `default`: Standard modal with no preset styling
 * - `delete`: Destructive action modal with red styling and trash icon
 */
export type MantineModalVariant = 'default' | 'delete';

const VARIANT_CONFIG: Record<
    MantineModalVariant,
    { icon?: IconType; color?: string; confirmLabel: string }
> = {
    default: {
        confirmLabel: 'Confirm',
    },
    delete: {
        icon: IconTrash,
        color: 'red',
        confirmLabel: 'Delete',
    },
};

/**
 * Generates a default description for the delete variant.
 */
const getVariantDescription = (
    variant: MantineModalVariant,
    resourceType?: string,
    resourceLabel?: string,
): string | undefined => {
    if (variant === 'delete' && resourceType) {
        if (resourceLabel) {
            return `Are you sure you want to delete the ${resourceType} "${resourceLabel}"?`;
        }
        return `Are you sure you want to delete this ${resourceType}?`;
    }
    return undefined;
};

export type MantineModalProps = {
    opened: boolean;
    onClose: () => void;
    title: string;
    /**
     * Modal variant for common action patterns.
     * - `delete`: Adds IconTrash, red action buttons, and auto-generates description
     * @default 'default'
     */
    variant?: MantineModalVariant;
    /**
     * The type of resource being acted upon (e.g., "chart", "dashboard", "space").
     * Used with `variant="delete"` to auto-generate description.
     */
    resourceType?: string;
    /**
     * The specific name/label of the resource being acted upon.
     * Used with `variant="delete"` and `resourceType` to generate:
     * "Are you sure you want to delete the {resourceType} "{resourceLabel}"?"
     */
    resourceLabel?: string;
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
     * For `variant="delete"`, this is auto-generated if `resourceType` is provided.
     */
    description?: string;
    /**
     * Modal body content. Optional if `description` is provided.
     */
    children?: React.ReactNode;
    /**
     * Handler for the primary confirm action button.
     * When provided, renders a confirm button with variant-appropriate styling.
     */
    onConfirm?: () => void;
    /**
     * Label for the confirm button.
     * @default "Confirm" for default variant, "Delete" for delete variant
     */
    confirmLabel?: string;
    /**
     * Whether the confirm button is disabled.
     * @default false
     */
    confirmDisabled?: boolean;
    /**
     * Whether the confirm button shows a loading state.
     * @default false
     */
    confirmLoading?: boolean;
    /**
     * Additional action buttons to display in the footer (right side), before the confirm button.
     * Use for secondary actions. For the primary action, prefer using `onConfirm`.
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
    variant = 'default',
    resourceType,
    resourceLabel,
    icon,
    size = 'lg',
    fullScreen = false,
    withCloseButton = true,
    description,
    children,
    onConfirm,
    confirmLabel,
    confirmDisabled = false,
    confirmLoading = false,
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
    const config = VARIANT_CONFIG[variant];

    const effectiveIcon = icon ?? config.icon;

    const effectiveDescription =
        description ??
        getVariantDescription(variant, resourceType, resourceLabel);

    const effectiveConfirmLabel = confirmLabel ?? config.confirmLabel;

    const confirmButtonColor = config.color;

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
                        {effectiveDescription && (
                            <Text fz="sm">{effectiveDescription}</Text>
                        )}
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
                        {effectiveDescription && (
                            <Text fz="sm">{effectiveDescription}</Text>
                        )}
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
                        {effectiveIcon ? (
                            <Paper p="6px" withBorder radius="md">
                                <MantineIcon icon={effectiveIcon} size="md" />
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

                {(onConfirm || actions || leftActions) && !fullScreen ? (
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
                            {onConfirm && (
                                <Button
                                    color={confirmButtonColor}
                                    onClick={onConfirm}
                                    disabled={confirmDisabled}
                                    loading={confirmLoading}
                                >
                                    {effectiveConfirmLabel}
                                </Button>
                            )}
                        </Group>
                    </Flex>
                ) : null}
            </Modal.Content>
        </Modal.Root>
    );
};

export default MantineModal;
