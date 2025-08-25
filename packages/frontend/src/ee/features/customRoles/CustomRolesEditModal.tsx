import {
    Button,
    Group,
    Modal,
    Stack,
    TextInput,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type FC, useEffect } from 'react';

import { type RoleWithScopes } from '@lightdash/common';

type EditModalProps = {
    isOpen: boolean;
    onClose: () => void;
    onSave: (values: { name: string; description?: string }) => void;
    isWorking?: boolean;
    role: RoleWithScopes;
};

export const CustomRolesEditModal: FC<EditModalProps> = ({
    isOpen,
    onClose,
    onSave,
    isWorking = false,
    role,
}) => {
    const form = useForm({
        initialValues: {
            name: role.name,
            description: role.description || '',
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

    // Reset form when role changes or modal opens
    useEffect(() => {
        if (isOpen) {
            form.setValues({
                name: role.name,
                description: role.description || '',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, role]);

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
            title="Edit custom role"
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
                    <Group position="right" mt="md">
                        <Button
                            variant="outline"
                            onClick={handleClose}
                            disabled={isWorking}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" loading={isWorking}>
                            Save changes
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
