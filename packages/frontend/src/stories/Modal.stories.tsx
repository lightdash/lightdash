import type { StoryObj } from '@storybook/react';

import { Alert, Button, Flex, Text } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
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
                    <Text size="sm" color="gray.9">
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
