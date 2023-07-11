import { Button, Modal, Stack, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';

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
            size="lg"
            opened={isOpen}
            className="non-draggable"
            onClose={onClose}
            title="Edit tile title"
        >
            <form onSubmit={handleOnSubmit}>
                <Stack spacing="md">
                    <TextInput
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
