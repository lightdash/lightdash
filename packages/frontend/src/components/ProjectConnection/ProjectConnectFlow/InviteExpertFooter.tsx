import { Box, Button, Group, Paper, Stack, Text } from '@mantine-8/core';
import { useDisclosure } from '@mantine/hooks';
import { IconUsers } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import classes from './InviteExpertFooter.module.css';
import SetupInviteModal from './SetupInviteModal';

const InviteExpertFooter: FC = () => {
    const [opened, { open, close }] = useDisclosure(false);

    return (
        <>
            <Paper
                withBorder
                shadow="subtle"
                radius="md"
                className={classes.callout}
            >
                <Group justify="space-between" wrap="nowrap" gap="md">
                    <Group wrap="nowrap" gap="md">
                        <Box className={classes.iconBox}>
                            <MantineIcon
                                icon={IconUsers}
                                size="lg"
                                color="ldGray.7"
                            />
                        </Box>
                        <Stack gap={2}>
                            <Text fw={600} size="sm">
                                Not the right person?
                            </Text>
                            <Text size="sm" c="dimmed">
                                Connecting the warehouse is usually a data-team
                                job.
                            </Text>
                        </Stack>
                    </Group>
                    <Button
                        variant="default"
                        className={classes.button}
                        onClick={open}
                    >
                        Invite an expert
                    </Button>
                </Group>
            </Paper>
            <SetupInviteModal opened={opened} onClose={close} />
        </>
    );
};

export default InviteExpertFooter;
