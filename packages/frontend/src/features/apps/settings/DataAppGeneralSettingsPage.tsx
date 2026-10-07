import {
    Box,
    Button,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import ErrorState from '../../../components/common/ErrorState';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import useHealth from '../../../hooks/health/useHealth';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';

export const DataAppGeneralSettingsPage: FC = () => {
    const health = useHealth();
    const {
        data: settings,
        isInitialLoading,
        isError,
        error,
        refetch,
    } = useOrganizationSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateOrganizationSettings();

    const hasHeadlessBrowser = health.data?.hasHeadlessBrowser ?? false;

    return (
        <SettingsPage
            title="General"
            description="Organization-wide behaviour of data apps."
        >
            {isError ? (
                <SettingsCard>
                    <Stack align="center">
                        <ErrorState error={error?.error} hasMarginTop={false} />
                        <Button
                            variant="default"
                            onClick={() => void refetch()}
                        >
                            Try again
                        </Button>
                    </Stack>
                </SettingsCard>
            ) : isInitialLoading || !settings || health.isInitialLoading ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <Stack gap="md">
                    {!hasHeadlessBrowser && (
                        <Callout
                            variant="info"
                            title="No headless browser is configured"
                        >
                            <Text fz="xs">
                                Thumbnails are captured in a headless browser,
                                and this instance does not have one. Automatic
                                capture is skipped until one is configured.
                            </Text>
                        </Callout>
                    )}
                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Title order={5} mb={4}>
                                    Automatically capture thumbnails
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    Each data app version gets a thumbnail when
                                    it becomes ready, rendered as the user who
                                    created it. Turning this off keeps existing
                                    thumbnails, and thumbnails can still be
                                    captured by hand.
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                aria-label="Automatically capture thumbnails for data app versions"
                                checked={
                                    settings.dataAppAutomaticThumbnailsEnabled !==
                                    false
                                }
                                disabled={isUpdating || !hasHeadlessBrowser}
                                onChange={(event) =>
                                    updateSettings({
                                        dataAppAutomaticThumbnailsEnabled:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>
                </Stack>
            )}
        </SettingsPage>
    );
};
