import { Button, Flex, Modal, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil } from '@tabler/icons-react';
import React from 'react';
import MantineIcon from '../../common/MantineIcon';

interface TileUpdateModalProps {
    title: string;
    placeholder: string;
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (title: string) => void;
}

const TileUpdateModal = ({
    title,
    placeholder,
    isOpen,
    onClose,
    onConfirm,
}: TileUpdateModalProps) => {
    const form = useForm({
        initialValues: {
            title,
        },
    });

    const handleOnSubmit = form.onSubmit(({ title: newTitle }) => {
        onConfirm(newTitle);
        onClose();
    });
    return (
        <Modal
            opened={isOpen}
            className="non-draggable"
            onClose={onClose}
            title={
                <Flex align="center" gap="xs">
                    <MantineIcon icon={IconPencil} size="lg" color="blue.8" />
                    <Title order={4}>Edit tile title</Title>
                </Flex>
            }
        >
            <form onSubmit={handleOnSubmit}>
                <Stack spacing="md">
                    <TextInput
                        required
                        label="Tile title"
                        placeholder={placeholder}
                        {...form.getInputProps('title')}
                    />
                    <Button type="submit" ml="auto">
                        Update title
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};

export default TileUpdateModal;
