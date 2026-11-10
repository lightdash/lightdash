import {
    Button,
    Code,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
} from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
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
import { AI_ANALYSIS_SETTINGS_PATH } from '../analysis/useDataAppAnalysisAvailability';

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

    // The instance env is the ceiling: when it is off the org switch is shown
    // off and cannot be turned on here.
    const capturesEnabledOnInstance =
        health.data?.dataApps.capturesEnabled !== false;
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
            ) : isInitialLoading || !settings || health.isInitialLoading ? (
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
                        description="Controls every way an image of your data can be captured in the builder, including thumbnails and the image posted with a Slack build. While screenshots are off, existing thumbnails stay hidden."
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
                    <SettingsSection label="AI analysis" description={null}>
                        <SettingsCard>
                            <SettingRow
                                icon={IconSparkles}
                                title="AI analysis"
                                description={
                                    <>
                                        AI analysis in data apps is configured
                                        under{' '}
                                        <Text
                                            span
                                            inherit
                                            component={Link}
                                            to={AI_ANALYSIS_SETTINGS_PATH}
                                            td="underline"
                                        >
                                            Ask AI · AI analysis
                                        </Text>
                                        .
                                    </>
                                }
                            />
                        </SettingsCard>
                    </SettingsSection>
                </>
            )}
        </SettingsPage>
    );
};
