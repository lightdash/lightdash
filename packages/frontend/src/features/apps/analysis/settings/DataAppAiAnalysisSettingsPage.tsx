import {
    DATA_APP_ANALYSIS_DEFAULT_LIMITS,
    type DataAppAnalysisLimits,
} from '@lightdash/common';
import {
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
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
import { NumberInput } from '../../../../components/common/NumberInput';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../components/common/Settings/SettingsCard';
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

type LimitField = {
    key: keyof DataAppAnalysisLimits;
    label: string;
    description: string;
    /** Empty means no cap. */
    nullable: boolean;
};

const LIMIT_FIELDS: LimitField[] = [
    {
        key: 'dailyDetectCap',
        label: 'Analyses per day',
        description:
            'Model runs of the analysis across all apps and viewers in your organization per UTC day. Stored analyses of identical results are reused and do not count. Leave empty for no cap.',
        nullable: true,
    },
    {
        key: 'dailyInvestigateCap',
        label: 'Investigations per day',
        description:
            'Agent investigations across all apps and viewers in your organization per UTC day. Leave empty for no cap.',
        nullable: true,
    },
    {
        key: 'investigateMaxSteps',
        label: 'Maximum steps per investigation',
        description: 'Model steps the agent may take before it must answer.',
        nullable: false,
    },
    {
        key: 'investigateMaxWarehouseQueries',
        label: 'Maximum warehouse queries per investigation',
        description:
            'Queries the agent may run; when reached it explains what it found so far and the result is marked partial.',
        nullable: false,
    },
];

type LimitsFormValues = Record<keyof DataAppAnalysisLimits, number | ''>;

const toFormValues = (limits: DataAppAnalysisLimits): LimitsFormValues => ({
    investigateMaxSteps: limits.investigateMaxSteps,
    investigateMaxWarehouseQueries: limits.investigateMaxWarehouseQueries,
    dailyDetectCap: limits.dailyDetectCap ?? '',
    dailyInvestigateCap: limits.dailyInvestigateCap ?? '',
});

const toLimits = (values: LimitsFormValues): DataAppAnalysisLimits => ({
    investigateMaxSteps: Number(values.investigateMaxSteps),
    investigateMaxWarehouseQueries: Number(
        values.investigateMaxWarehouseQueries,
    ),
    dailyDetectCap:
        values.dailyDetectCap === '' ? null : Number(values.dailyDetectCap),
    dailyInvestigateCap:
        values.dailyInvestigateCap === ''
            ? null
            : Number(values.dailyInvestigateCap),
});

const LimitsForm: FC<{
    initialLimits: DataAppAnalysisLimits;
    disabled: boolean;
}> = ({ initialLimits, disabled }) => {
    const updateSettings = useUpdateAiOrganizationSettings();
    const initialValues = toFormValues(initialLimits);
    const form = useForm({ initialValues });
    const isUnchanged = LIMIT_FIELDS.every(
        ({ key }) => form.values[key] === initialValues[key],
    );
    const handleSubmit = form.onSubmit((values) => {
        updateSettings.mutate({ dataAppAnalysisLimits: toLimits(values) });
    });

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>Limits</Title>
                <Text c="dimmed" fz="xs">
                    Caps on how much AI analysis your organization can run. On
                    Lightdash's AI key the daily caps cannot exceed{' '}
                    {DATA_APP_ANALYSIS_DEFAULT_LIMITS.dailyDetectCap} analyses
                    and {DATA_APP_ANALYSIS_DEFAULT_LIMITS.dailyInvestigateCap}{' '}
                    investigations; on your own key they apply as set.
                </Text>
            </Box>
            <form onSubmit={handleSubmit}>
                <Stack gap="md">
                    {LIMIT_FIELDS.map((field) => (
                        <NumberInput
                            key={field.key}
                            label={field.label}
                            description={field.description}
                            placeholder={field.nullable ? 'No cap' : undefined}
                            min={1}
                            allowDecimal={false}
                            allowNegative={false}
                            thousandSeparator=","
                            disabled={disabled}
                            {...form.getInputProps(field.key)}
                        />
                    ))}
                    <Group justify="flex-end">
                        {!isUnchanged && !updateSettings.isLoading && (
                            <Button
                                variant="outline"
                                onClick={() => form.setValues(initialValues)}
                            >
                                Cancel
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={disabled || isUnchanged}
                            loading={updateSettings.isLoading}
                        >
                            Save
                        </Button>
                    </Group>
                </Stack>
            </form>
        </SettingsGridCard>
    );
};

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
                    <LimitsForm
                        key={JSON.stringify(
                            settings.dataAppAnalysisLimits ??
                                DATA_APP_ANALYSIS_DEFAULT_LIMITS,
                        )}
                        initialLimits={
                            settings.dataAppAnalysisLimits ??
                            DATA_APP_ANALYSIS_DEFAULT_LIMITS
                        }
                        disabled={isUpdating || !aiOn || !analysisOn}
                    />
                </Stack>
            )}
        </SettingsPage>
    );
};
