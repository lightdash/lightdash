import { MobileSetupCodeStatus } from '@lightdash/common';
import {
    Button,
    Group,
    Loader,
    Paper,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconDeviceMobileCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../../components/common/SuboptimalState/SuboptimalState';
import useHealth from '../../../hooks/health/useHealth';
import { useActiveProjectUuid } from '../../../hooks/useActiveProject';
import { useMobileSetupSession } from '../hooks/useMobileSetupSession';
import { AppStoreBadges } from './AppStoreBadges';
import classes from './MobileAppSettingsPanel.module.css';
import { MobileSetupQrCode } from './MobileSetupQrCode';

const MobileAppSettingsPanel: FC = () => {
    const { data: health } = useHealth();
    const { activeProjectUuid, isLoading: isProjectLoading } =
        useActiveProjectUuid();

    const { link, status, isLoading, error, setupAnotherDevice } =
        useMobileSetupSession({
            projectUuid: activeProjectUuid,
            enabled: !isProjectLoading,
        });

    const renderCode = () => {
        if (status === MobileSetupCodeStatus.REDEEMED) {
            return (
                <Stack gap="md" align="flex-start">
                    <Group gap="xs">
                        <MantineIcon
                            icon={IconDeviceMobileCheck}
                            color="green.6"
                        />
                        <Text fw={500}>Signed in on your phone</Text>
                    </Group>
                    <Button variant="default" onClick={setupAnotherDevice}>
                        Set up another device
                    </Button>
                </Stack>
            );
        }

        if (status === MobileSetupCodeStatus.REVOKED) {
            return (
                <Stack gap="md" align="flex-start">
                    <Text c="dimmed">
                        This code was replaced by a newer one, so it no longer
                        works.
                    </Text>
                    <Button variant="default" onClick={setupAnotherDevice}>
                        Show a new code
                    </Button>
                </Stack>
            );
        }

        if (error) {
            return (
                <SuboptimalState
                    title="We could not create a setup code"
                    description={error.error.message}
                    action={
                        <Button variant="default" onClick={setupAnotherDevice}>
                            Try again
                        </Button>
                    }
                />
            );
        }

        if (isLoading || !link) {
            return (
                <Group className={classes.qrPlaceholder} justify="center">
                    <Loader size="sm" />
                </Group>
            );
        }

        return <MobileSetupQrCode value={link} />;
    };

    return (
        <SettingsPage
            title="Mobile app"
            description="Sign in to the Lightdash app on your phone."
        >
            <Paper p="lg">
                <Stack gap="md" align="flex-start">
                    <Stack gap={4}>
                        <Title order={5}>Lightdash on your phone</Title>
                        <Text fz="sm" c="dimmed">
                            Point your phone's camera at this code to open
                            Lightdash signed in on your current project.
                        </Text>
                    </Stack>

                    {renderCode()}

                    {health ? (
                        <Stack gap="xs">
                            <Text fz="sm" c="dimmed">
                                Or install the app first:
                            </Text>
                            <AppStoreBadges
                                playStoreUrl={health.mobileApp.playStoreUrl}
                                appStoreUrl={health.mobileApp.appStoreUrl}
                            />
                        </Stack>
                    ) : null}
                </Stack>
            </Paper>
        </SettingsPage>
    );
};

export default MobileAppSettingsPanel;
