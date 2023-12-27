import { Button, Group, Modal, Stack, TextInput, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconUsersGroup } from '@tabler/icons-react';
import React, { FC } from 'react';
import { useGroupCreateMutation } from '../../../hooks/useOrganizationGroups';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../../common/MantineIcon';

const CreateGroupModal: FC<{
    opened: boolean;
    onClose: () => void;
}> = ({ opened, onClose }) => {
    const form = useForm<{ name: string }>({
        initialValues: {
            name: '',
        },
        validate: {
            name: (value: string) =>
                value.length ? null : 'Group name is required',
        },
    });
    const { user } = useApp();

    const { mutateAsync, isLoading } = useGroupCreateMutation();

    const handleSubmit = async (data: { name: string }) => {
        await mutateAsync(data);
        form.reset();
        onClose();
    };

    if (user.data?.ability?.cannot('manage', 'Organization')) {
        return null;
    }

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" icon={IconUsersGroup} />
                    <Title order={4}>Create group</Title>
                </Group>
            }
            size="lg"
        >
            <form
                name="create_group"
                onSubmit={form.onSubmit((values: { name: string }) =>
                    handleSubmit(values),
                )}
            >
                <Stack align="flex-end" spacing="xs">
                    <TextInput
                        label="Group name"
                        required
                        w="100%"
                        disabled={isLoading}
                        {...form.getInputProps('name')}
                    />

                    <Button
                        disabled={isLoading}
                        type="submit"
                        sx={{ alignSelf: 'end' }}
                    >
                        Create group
                    </Button>
                </Stack>
            </form>
        </Modal>
    );
};

export default CreateGroupModal;
