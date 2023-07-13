import { OrgUserAttribute } from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { FC } from 'react';

const UserAttributeModal: FC<{
    opened: boolean;
    defaultValues?: OrgUserAttribute;
    onClose: () => void;
    onChange: (orgUserAttribute: OrgUserAttribute) => void;
}> = ({ opened, defaultValues, onChange, onClose }) => {
    const form = useForm<OrgUserAttribute>({
        initialValues: defaultValues,
    });

    const handleSubmit = async (data: OrgUserAttribute) => {
        onChange(data);
        form.reset();
    };

    return (
        <Modal
            opened={opened}
            onClose={onClose}
            title={<Title order={4}>Add user attribute</Title>}
            size="lg"
        >
            <form
                name="invite_user"
                onSubmit={form.onSubmit((values: OrgUserAttribute) =>
                    handleSubmit(values),
                )}
            >
                <Stack spacing="md">
                    <TextInput
                        name="name"
                        label="Attribute name"
                        placeholder="E.g. user_country"
                        required
                        {...form.getInputProps('name')}
                    />

                    <Textarea
                        name="description"
                        label="Description"
                        placeholder="E.g. The country where the user is querying data from."
                        {...form.getInputProps('description')}
                    />
                    <Stack>
                        <Text fw={500}>Assing to users</Text>
                    </Stack>

                    <Group spacing="xs" position="right" mt="md">
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                            }}
                            variant="outline"
                        >
                            Cancel
                        </Button>
                        <Button type="submit">Add</Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default UserAttributeModal;
