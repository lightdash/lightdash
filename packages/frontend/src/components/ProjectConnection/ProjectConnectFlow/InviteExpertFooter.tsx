import { subject } from '@casl/ability';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import classes from './InviteExpertFooter.module.css';
import { InviteTeammateModal } from './InviteTeammateModal';

const InviteExpertFooter: FC = () => {
    const { user } = useApp();
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    const canInviteUsers =
        user.data?.ability?.can(
            'manage',
            subject('OrganizationMemberProfile', {
                organizationUuid: user.data?.organizationUuid,
            }),
        ) ?? false;

    const organizationUuid = user.data?.organizationUuid;
    if (!organizationUuid || !canInviteUsers) return null;

    return (
        <Paper radius="md" className={classes.callout}>
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
                    variant="default"
                    className={classes.button}
                    onClick={() => setIsInviteOpen(true)}
                >
                    Invite an expert
                </Button>
            </Group>
            <InviteTeammateModal
                opened={isInviteOpen}
                onClose={() => setIsInviteOpen(false)}
                organizationUuid={organizationUuid}
            />
        </Paper>
    );
};

export default InviteExpertFooter;
