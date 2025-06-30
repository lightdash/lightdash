import {
    Flex,
    type FlexProps,
    Group,
    Modal,
    type ModalBaseSettings,
    type ModalBodyProps,
    type ModalContentProps,
    type ModalHeaderProps,
    Paper,
    Stack,
    Text,
} from '@mantine/core';
import { type Icon as IconType } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../MantineIcon';

const modalSizes = {
    sm: 380,
    lg: 480,
    xl: 600,
} as const;

export type MantineModalProps = {
    opened: boolean;
    onClose: () => void;
    title: string;
    icon?: IconType;
    size?: keyof typeof modalSizes;
    children: React.ReactNode;
    actions?: React.ReactNode;
    modalRootProps?: Partial<ModalBaseSettings>;
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
    children,
    actions,
    modalRootProps,
    modalContentProps,
    modalHeaderProps,
    modalBodyProps,
    modalActionsProps,
}) => {
    return (
        <Modal.Root
            opened={opened}
            onClose={onClose}
            size={modalSizes[size]}
            centered
            {...modalRootProps}
        >
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    maxWidth: '800px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
                {...modalContentProps}
            >
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                    })}
                    px="xl"
                    py="md"
                    {...modalHeaderProps}
                >
                    <Group spacing="sm">
                        {icon ? (
                            <Paper p="xxs" withBorder radius="sm">
                                <MantineIcon icon={icon} size="md" />
                            </Paper>
                        ) : null}
                        <Text color="gray.9" fw={700} fz="md">
                            {title}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body
                    p={0}
                    sx={() => ({
                        overflow: 'auto',
                        maxHeight: 'calc(80vh - 130px)',
                    })}
                    {...modalBodyProps}
                >
                    <Stack
                        spacing="md"
                        {...{
                            px: modalBodyProps?.px ?? 'xl',
                            py: modalBodyProps?.py ?? 'md',
                        }}
                    >
                        {children}
                    </Stack>
                </Modal.Body>
                {actions ? (
                    <Flex
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.gray[2]}`,
                            position: 'sticky',
                            bottom: 0,
                            width: '100%',
                            zIndex: 10,
                        })}
                        bg="white"
                        px="xl"
                        py="md"
                        justify="flex-end"
                        gap="sm"
                        {...modalActionsProps}
                    >
                        {actions}
                    </Flex>
                ) : null}
            </Modal.Content>
        </Modal.Root>
    );
};

export default MantineModal;
