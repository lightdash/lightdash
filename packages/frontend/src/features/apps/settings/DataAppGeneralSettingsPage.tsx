import { FeatureFlags } from '@lightdash/common';
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
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

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

    const automaticThumbnailsFlag = useServerFeatureFlag(
        FeatureFlags.EnableDataAppAutomaticThumbnails,
    );

    const hasHeadlessBrowser = health.data?.hasHeadlessBrowser ?? false;
    // The instance env is the ceiling: when it is off the org switch is shown
    // off and cannot be turned on here.
    const capturesEnabledOnInstance =
        health.data?.dataApps.capturesEnabled !== false;
    const automaticThumbnailsAvailable =
        automaticThumbnailsFlag.data?.enabled === true;
    // Already resolved against the instance ceiling by the API.
    const capturesEnabled = settings?.dataAppCapturesEnabled !== false;

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
            ) : isInitialLoading ||
              !settings ||
              health.isInitialLoading ||
              automaticThumbnailsFlag.isInitialLoading ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <Stack gap="md">
                    {!capturesEnabledOnInstance && (
                        <Callout
                            variant="info"
                            title="Screenshots and attachments are disabled on this instance"
                        >
                            <Text fz="xs">
                                The instance is configured with
                                LIGHTDASH_APP_CAPTURES_ENABLED set to false, so
                                screenshots, file attachments and thumbnails are
                                off for every organization and cannot be turned
                                on here.
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
                                    Allow screenshots and attachments
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    Lets people attach screenshots of a running
                                    app and files to a build, where the coding
                                    agent can read them, and lets thumbnails of
                                    apps be captured. Turning this off removes
                                    every way an image of your data can be
                                    captured in the builder, including automatic
                                    thumbnails and the image posted with a Slack
                                    build. Existing thumbnails are kept but
                                    hidden until it is turned back on.
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                aria-label="Allow screenshots and attachments in data app builds"
                                checked={capturesEnabled}
                                disabled={
                                    isUpdating || !capturesEnabledOnInstance
                                }
                                onChange={(event) =>
                                    updateSettings({
                                        dataAppCapturesEnabled:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>
                    {automaticThumbnailsAvailable && (
                        <>
                            {!hasHeadlessBrowser && capturesEnabled && (
                                <Callout
                                    variant="info"
                                    title="No headless browser is configured"
                                >
                                    <Text fz="xs">
                                        Thumbnails are captured in a headless
                                        browser, and this instance does not have
                                        one. Automatic capture is skipped until
                                        one is configured.
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
                                            Each data app version gets a
                                            thumbnail when it becomes ready,
                                            rendered as the user who created it.
                                            Text is blurred so values are not
                                            readable. Turning this off keeps
                                            existing thumbnails, and thumbnails
                                            can still be captured by hand.
                                        </Text>
                                        {!capturesEnabled && (
                                            <Text c="dimmed" fz="xs" mt={4}>
                                                Off while screenshots and
                                                attachments are not allowed.
                                            </Text>
                                        )}
                                    </Box>
                                    <Switch
                                        size="md"
                                        aria-label="Automatically capture thumbnails for data app versions"
                                        checked={
                                            settings.dataAppAutomaticThumbnailsEnabled !==
                                            false
                                        }
                                        disabled={
                                            isUpdating ||
                                            !hasHeadlessBrowser ||
                                            !capturesEnabled
                                        }
                                        onChange={(event) =>
                                            updateSettings({
                                                dataAppAutomaticThumbnailsEnabled:
                                                    event.currentTarget.checked,
                                            })
                                        }
                                    />
                                </Group>
                            </SettingsCard>
                        </>
                    )}
                </Stack>
            )}
        </SettingsPage>
    );
};
