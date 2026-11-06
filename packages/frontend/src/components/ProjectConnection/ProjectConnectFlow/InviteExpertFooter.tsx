import { subject } from '@casl/ability';
import { FeatureFlags } from '@lightdash/common';
import { Box, Button, Group, Paper, Stack, Text } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useLocation } from 'react-router';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import classes from './InviteExpertFooter.module.css';
import { InviteTeammateModal } from './InviteTeammateModal';

const InviteExpertFooter: FC = () => {
    const location = useLocation();
    const { user } = useApp();
    const newOnboarding = useServerFeatureFlag(FeatureFlags.NewOnboarding);
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
                {/* The legacy invite page stays for orgs without the new onboarding */}
                {newOnboarding.data?.enabled ? (
                    <Button
                        variant="default"
                        className={classes.button}
                        onClick={() => setIsInviteOpen(true)}
                    >
                        Invite an expert
                    </Button>
                ) : (
                    <Button
                        component={Link}
                        to="/onboarding/invite-expert"
                        state={{ returnTo: location.pathname }}
                        variant="default"
                        className={classes.button}
                    >
                        Invite an expert
                    </Button>
                )}
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
