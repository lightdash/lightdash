import { FeatureFlags } from '@lightdash/common';
import {
    Button,
    Code,
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { type FC } from 'react';
import Callout from '../../../components/common/Callout';
import ErrorState from '../../../components/common/ErrorState';
import {
    SettingRow,
    SettingsSection,
} from '../../../components/common/Settings/SettingLayout';
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
                <>
                    {!capturesEnabledOnInstance && (
                        <Callout
                            variant="info"
                            title="Screenshots and attachments are disabled on this instance"
                        >
                            The instance is configured with
                            LIGHTDASH_APP_CAPTURES_ENABLED set to false, so
                            screenshots, file attachments and thumbnails are off
                            for every organization and cannot be turned on here.
                        </Callout>
                    )}
                    <SettingsSection
                        label="Screenshots and thumbnails"
                        description="Controls every way an image of your data can be captured in the builder, including automatic thumbnails and the image posted with a Slack build. While screenshots are off, existing thumbnails stay hidden."
                    >
                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    title="Allow screenshots and attachments"
                                    description="Attach screenshots of a running app and files to a build for the coding agent to read."
                                    control={
                                        <Switch
                                            size="md"
                                            aria-label="Allow screenshots and attachments in data app builds"
                                            checked={capturesEnabled}
                                            disabled={
                                                isUpdating ||
                                                !capturesEnabledOnInstance
                                            }
                                            onChange={(event) =>
                                                updateSettings({
                                                    dataAppCapturesEnabled:
                                                        event.currentTarget
                                                            .checked,
                                                })
                                            }
                                        />
                                    }
                                />
                                {automaticThumbnailsAvailable && (
                                    <>
                                        <Divider />
                                        <SettingRow
                                            title="Automatically capture thumbnails"
                                            description="Each data app version gets a thumbnail when it becomes ready, rendered as the user who created it. Text is blurred so values are not readable. Turning this off keeps existing thumbnails, and thumbnails can still be captured by hand."
                                            control={
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
                                                                event
                                                                    .currentTarget
                                                                    .checked,
                                                        })
                                                    }
                                                />
                                            }
                                        >
                                            {!capturesEnabled && (
                                                <Text
                                                    c="dimmed"
                                                    fz="xs"
                                                    mt="xxs"
                                                >
                                                    Off while screenshots and
                                                    attachments are not allowed.
                                                </Text>
                                            )}
                                            {!hasHeadlessBrowser &&
                                                capturesEnabled && (
                                                    <Callout
                                                        variant="info"
                                                        title="No headless browser is configured"
                                                        mt="sm"
                                                    >
                                                        Thumbnails are captured
                                                        in a headless browser,
                                                        and this instance does
                                                        not have one. Automatic
                                                        capture is skipped until
                                                        one is configured.
                                                    </Callout>
                                                )}
                                        </SettingRow>
                                    </>
                                )}
                            </Stack>
                        </SettingsCard>
                    </SettingsSection>
                    <SettingsSection
                        label="Custom dependencies"
                        description="Custom dependencies are npm packages added to a data app's build. They run in the browser of everyone who views the app."
                    >
                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    title="Allow custom dependencies"
                                    description={
                                        <>
                                            Uploading an app with custom
                                            dependencies also needs the{' '}
                                            <Code>
                                                manage:DataAppDependency
                                            </Code>{' '}
                                            permission, which administrators
                                            have by default. Turning this off
                                            blocks new uploads; apps that
                                            already use custom dependencies keep
                                            building.
                                        </>
                                    }
                                    control={
                                        <Switch
                                            size="md"
                                            aria-label="Allow custom dependencies in data apps"
                                            checked={
                                                settings.dataAppCustomDependenciesEnabled
                                            }
                                            disabled={isUpdating}
                                            onChange={(event) =>
                                                updateSettings({
                                                    dataAppCustomDependenciesEnabled:
                                                        event.currentTarget
                                                            .checked,
                                                })
                                            }
                                        />
                                    }
                                />
                            </Stack>
                        </SettingsCard>
                    </SettingsSection>
                </>
            )}
        </SettingsPage>
    );
};
