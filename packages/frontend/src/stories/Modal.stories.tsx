import type { StoryObj } from '@storybook/react';

import {
    Alert,
    Button,
    Flex,
    Paper,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconSettings, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import MantineModal from '../components/common/MantineModal';

export default {
    component: MantineModal,
};

type Story = StoryObj<typeof MantineModal>;

export const Default: Story = {
    args: {
        opened: true,
        onClose: () => {},
        title: 'Modal Title',
        icon: IconTrash,

        children: (
            <>
                <Text>
                    Are you sure you want to delete space <b>"Jaffle Shop"</b>?
                </Text>
                <Alert color="red">
                    <Text size="sm" color="ldGray.9">
                        <strong>This will permanently delete:</strong>
                    </Text>
                    <ul style={{ paddingLeft: '1rem' }}>
                        <li>1 chart</li>
                        <li>3 dashboards</li>
                        <li>5 nested spaces</li>
                    </ul>
                </Alert>
            </>
        ),

        actions: (
            <Flex gap="sm">
                <Button variant="default" h={32}>
                    Cancel
                </Button>
                <Button h={32} type="submit" color="red">
                    Delete Space
                </Button>
            </Flex>
        ),
        size: 'lg',

        // Optional styling props
        modalRootProps: {},
        modalContentProps: {},
        modalHeaderProps: {},
        modalBodyProps: {},
        modalActionsProps: {},
    },
};

export const WithForm: Story = {
    render: () => {
        const [opened, setOpened] = useState(false);

        const form = useForm({
            initialValues: {
                name: '',
            },
        });

        const handleSubmit = form.onSubmit((values) => {
            console.log('Form submitted with values:', values);
            setOpened(false);
        });

        return (
            <>
                <Stack>
                    <Paper withBorder p="md">
                        <Title order={3}>Dev notes</Title>
                        <Text>
                            Make sure you pass a form "id" to the form
                            <br />
                            Make sure you pass a "form" attribute to the submit
                            button
                        </Text>
                    </Paper>
                    <Button onClick={() => setOpened(true)}>
                        Open modal with form
                    </Button>
                </Stack>

                <MantineModal
                    title="Form Example"
                    opened={opened}
                    onClose={() => setOpened(false)}
                    icon={IconSettings}
                    actions={
                        <Flex gap="sm">
                            <Button
                                variant="default"
                                h={32}
                                onClick={() => setOpened(false)}
                            >
                                Cancel
                            </Button>
                            <Button
                                h={32}
                                type="submit"
                                form="modal-form-example"
                                disabled={!form.isValid()}
                            >
                                Submit
                            </Button>
                        </Flex>
                    }
                >
                    <form id="modal-form-example" onSubmit={handleSubmit}>
                        <TextInput
                            label="Name"
                            required
                            placeholder="Enter a name"
                            {...form.getInputProps('name')}
                        />
                    </form>
                </MantineModal>
            </>
        );
    },
};
