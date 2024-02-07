import {
    ActionIcon,
    Avatar,
    Box,
    Button,
    Divider,
    Group,
    Popover,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { IconMessage } from '@tabler/icons-react';
import MantineIcon from '../common/MantineIcon';

// TODO: Add Comment
// TODO: Read Comment
// TODO: Delete Comment

export const Comments = () => {
    return (
        <Popover
            withArrow
            withinPortal
            shadow="md"
            position="bottom-end"
            offset={4}
            arrowOffset={10}
            opened
            zIndex={10000}
        >
            <Popover.Dropdown onMouseOver={(e) => e.stopPropagation()}>
                {/* Add comments list */}

                <Stack spacing="xs">
                    <Group>
                        <Avatar>JV</Avatar>
                        <Text>João Viana</Text>
                        <Text>10 mins ago</Text>
                    </Group>
                    <Box ml="lg">
                        <Text>My comment on this chart is amazing</Text>
                    </Box>
                    <Divider />
                </Stack>

                <Stack spacing="xs" mt="xs">
                    <TextInput
                        placeholder="Type your comment here..."
                        size="xs"
                        radius="sm"
                    />

                    <Button
                        variant="default"
                        size="xs"
                        sx={{
                            alignSelf: 'flex-end',
                        }}
                    >
                        Add comment
                    </Button>
                </Stack>
            </Popover.Dropdown>

            <Popover.Target>
                <ActionIcon size="sm" onMouseOver={(e) => e.stopPropagation()}>
                    <MantineIcon icon={IconMessage} />
                </ActionIcon>
            </Popover.Target>
        </Popover>
    );
};
