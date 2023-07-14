import { OrgAttribute } from '@lightdash/common';
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
import { IconCircleX, IconPlus } from '@tabler/icons-react';
import { FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

const UserAttributeModal: FC<{
    opened: boolean;
    defaultValues?: OrgAttribute;
    onClose: () => void;
    onChange: (orgUserAttribute: OrgAttribute) => void;
}> = ({ opened, defaultValues, onChange, onClose }) => {
    const form = useForm<OrgAttribute>({
        initialValues: defaultValues,
    });

    const handleSubmit = async (data: OrgAttribute) => {
        //TODo validation
        await onChange(data);
        form.reset();
        onClose();
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
                onSubmit={form.onSubmit((values: OrgAttribute) =>
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

                        {form.values.users?.length > 0 && (
                            <Group>
                                <Text w={200} fw={500}>
                                    User email
                                </Text>
                                <Text fw={500}>Value</Text>
                            </Group>
                        )}

                        {form.values.users?.map((user, index) => {
                            return (
                                <Group key={index}>
                                    <TextInput
                                        w={200}
                                        name={`users.${index}.userUuid`}
                                        placeholder="E.g. test@lightdash.com"
                                        required
                                        {...form.getInputProps(
                                            `users.${index}.userUuid`,
                                        )}
                                    />
                                    <TextInput
                                        name={`users.${index}.value`}
                                        placeholder="E.g. US"
                                        required
                                        {...form.getInputProps(
                                            `users.${index}.value`,
                                        )}
                                    />
                                    <Button
                                        pr={5}
                                        leftIcon={
                                            <MantineIcon icon={IconCircleX} />
                                        }
                                        color="red"
                                        variant="outline"
                                        onClick={() => {
                                            form.setFieldValue(
                                                'users',
                                                form.values.users.filter(
                                                    (_, i) => i !== index,
                                                ),
                                            );
                                        }}
                                    />
                                </Group>
                            );
                        })}
                        <Button
                            w={200}
                            leftIcon={<MantineIcon icon={IconPlus} />}
                            onClick={() => {
                                form.setFieldValue('users', [
                                    ...(form.values.users || []),
                                    { userUuid: '', value: '' },
                                ]);
                            }}
                        >
                            Add user
                        </Button>
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
