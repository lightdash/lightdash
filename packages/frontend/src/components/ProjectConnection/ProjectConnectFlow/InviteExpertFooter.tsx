import { subject } from '@casl/ability';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine-8/core';
import { IconUsers } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link, useLocation } from 'react-router';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import classes from './InviteExpertFooter.module.css';

const InviteExpertFooter: FC = () => {
    const location = useLocation();
    const { user } = useApp();

    const canInviteUsers =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationMemberProfile', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;

    if (!user.data || !canInviteUsers) return null;

    return (
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
                            Connecting the warehouse is usually a data-team job.
                        </Text>
                    </Stack>
                </Group>
                <Button
                    component={Link}
                    to="/onboarding/invite-expert"
                    state={{ returnTo: location.pathname }}
                    variant="default"
                    className={classes.button}
                >
                    Invite an expert
                </Button>
            </Group>
        </Paper>
    );
};

export default InviteExpertFooter;
