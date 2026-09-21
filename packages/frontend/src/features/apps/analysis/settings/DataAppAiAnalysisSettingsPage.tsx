import {
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import {
    IconMessageChatbot,
    IconPlayerPlay,
    IconSparkles,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { SettingsCard } from '../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

const SettingRow: FC<{
    icon: Icon;
    name: string;
    description: string;
    checked: boolean;
    disabled: boolean;
    onChange: (checked: boolean) => void;
}> = ({ icon, name, description, checked, disabled, onChange }) => (
    <Group wrap="nowrap" align="flex-start" gap="sm">
        <MantineIcon icon={icon} size="lg" color="ldGray.7" />
        <Stack gap={2} flex={1}>
            <Title order={6}>{name}</Title>
            <Text c="dimmed" fz="xs">
                {description}
            </Text>
        </Stack>
        <Switch
            size="md"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.currentTarget.checked)}
        />
    </Group>
);

export const DataAppAiAnalysisSettingsPage: FC = () => {
    const { data: settings, isInitialLoading } =
        useAiOrganizationAdminSettings();
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdateAiOrganizationSettings();

    const aiOn = settings
        ? settings.isCopilotEnabled || settings.isTrial
        : false;
    const analysisOn = settings?.dataAppRuntimeAiEnabled ?? false;

    return (
        <SettingsPage
            title="AI analysis"
            description="Let viewers analyse what a data app shows and investigate notable data points."
        >
            {isInitialLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <Stack gap="md">
                    {!aiOn && (
                        <Callout variant="warning" title="AI is not enabled">
                            <Text fz="xs">
                                AI analysis needs Ask AI enabled for the
                                organization. Turn it on under{' '}
                                <Text
                                    span
                                    component={Link}
                                    to="/generalSettings/ai/general"
                                    td="underline"
                                >
                                    Ask AI · General
                                </Text>
                                .
                            </Text>
                        </Callout>
                    )}
                    <SettingsCard>
                        <Stack gap="md">
                            <SettingRow
                                icon={IconSparkles}
                                name="AI analysis"
                                description="Lets viewers analyse the current view of any data app. Sends query results a viewer already has access to, to your configured AI provider."
                                checked={analysisOn}
                                disabled={isUpdating || !aiOn}
                                onChange={(checked) =>
                                    updateSettings({
                                        dataAppRuntimeAiEnabled: checked,
                                    })
                                }
                            />
                            <Divider />
                            <SettingRow
                                icon={IconPlayerPlay}
                                name="Analyse automatically on load"
                                description="Default for apps: run the analysis when a viewer opens an app, without a click. Stored analyses of identical results are reused."
                                checked={
                                    settings.dataAppAutoAnalysisEnabled ?? false
                                }
                                disabled={isUpdating || !aiOn || !analysisOn}
                                onChange={(checked) =>
                                    updateSettings({
                                        dataAppAutoAnalysisEnabled: checked,
                                    })
                                }
                            />
                            <Divider />
                            <SettingRow
                                icon={IconMessageChatbot}
                                name="Continue investigations in Ask AI"
                                description="Lets viewers carry an investigation on as an Ask AI thread. The thread stays read-only. Off keeps viewers at the explanation."
                                checked={
                                    settings.dataAppContinueInAskAiEnabled ??
                                    true
                                }
                                disabled={isUpdating || !aiOn || !analysisOn}
                                onChange={(checked) =>
                                    updateSettings({
                                        dataAppContinueInAskAiEnabled: checked,
                                    })
                                }
                            />
                        </Stack>
                    </SettingsCard>
                </Stack>
            )}
        </SettingsPage>
    );
};
