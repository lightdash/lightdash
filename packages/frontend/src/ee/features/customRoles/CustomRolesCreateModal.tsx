import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';

type CreateModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (values: { name: string; description?: string }) => void;
    isWorking?: boolean;
};

export const CustomRolesCreateModal: FC<CreateModalProps> = ({
    isOpen,
    onClose,
    onSave,
    isWorking = false,
}) => {
    const form = useForm({
        initialValues: {
            name: '',
            description: '',
        },
        validate: {
            name: (value) => {
                if (!value || value.trim().length === 0) {
                    return 'Role name is required';
                }
                if (value.length < 3) {
                    return 'Role name must be at least 3 characters';
                }
                if (value.length > 50) {
                    return 'Role name must be less than 50 characters';
                }
                return null;
            },
            description: (value) => {
                if (value && value.length > 200) {
                    return 'Description must be less than 200 characters';
                }
                return null;
            },
        },
    });

    const handleSubmit = form.onSubmit((values) => {
        onSave({
            name: values.name,
            description: values.description || undefined,
        });
    });

    const handleClose = () => {
        form.reset();
        onClose();
    };

    return (
        <Modal
            opened={isOpen}
            onClose={handleClose}
            title="Create custom role"
            size="md"
        >
            <form onSubmit={handleSubmit}>
                <Stack>
                    <TextInput
                        label="Role name"
                        placeholder="e.g., Finance Analyst"
                        required
                        disabled={isWorking}
                        {...form.getInputProps('name')}
                    />
                    <Textarea
                        label="Description"
                        placeholder="Describe the purpose of this role"
                        rows={3}
                        disabled={isWorking}
                        {...form.getInputProps('description')}
                    />
                    <Text size="sm" color="dimmed">
                        You can configure permissions and scopes after creating
                        the role.
                    </Text>
                    <Group position="right" mt="md">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isWorking}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isWorking}>
                            Create role
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
