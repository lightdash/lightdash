import {
    DATA_APP_ANALYSIS_DEFAULT_LIMITS,
    DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS,
    type DataAppAnalysisLimits,
} from '@lightdash/common';
import {
    Button,
    Divider,
    Group,
    Loader,
    Stack,
    Switch,
    Text,
    Textarea,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconMessageChatbot, IconSparkles } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import Callout from '../../../../components/common/Callout';
import { NumberInput } from '../../../../components/common/NumberInput';
import {
    SettingRow,
    SettingsSection,
} from '../../../../components/common/Settings/SettingLayout';
import { SettingsCard } from '../../../../components/common/Settings/SettingsCard';
import {
    SettingsPage,
    SettingsPageDocumentationLink,
} from '../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';

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
            'Model runs of the analysis. Stored analyses of identical results are reused and do not count. Leave empty for no cap.',
        nullable: true,
    },
    {
        key: 'dailyInvestigateCap',
        label: 'Investigations per day',
        description: 'Agent investigations. Leave empty for no cap.',
        nullable: true,
    },
    {
        key: 'dailyPromptCap',
        label: 'Prompts per day',
        description: 'Answers to in-app AI prompts. Leave empty for no cap.',
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
    dailyPromptCap: limits.dailyPromptCap ?? '',
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
    dailyPromptCap:
        values.dailyPromptCap === '' ? null : Number(values.dailyPromptCap),
});

// Per-run limits must hold a value; only the daily caps may be left empty.
const requiredLimit = (value: number | '') =>
    value === '' ? 'Enter a value of 1 or more' : null;

const InstructionsForm: FC<{
    initialInstructions: string | null;
    disabled: boolean;
}> = ({ initialInstructions, disabled }) => {
    const updateSettings = useUpdateAiOrganizationSettings();
    const initialValue = initialInstructions ?? '';
    const form = useForm({
        initialValues: { instructions: initialValue },
    });
    const isUnchanged = form.values.instructions.trim() === initialValue;
    const handleSubmit = form.onSubmit((values) => {
        updateSettings.mutate({
            dataAppAnalysisDefaultInstructions:
                values.instructions.trim() || null,
        });
    });

    return (
        <SettingsSection
            label="Summary instructions"
            description="Guidance every AI analysis summary in your organization follows — language, formats, or a line of domain vocabulary. An app's own instructions are applied on top of these."
        >
            <SettingsCard>
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        <Textarea
                            placeholder="e.g. Write in British English. Show amounts in ZAR."
                            description={`Up to ${DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS} characters. Changing this re-runs stored analyses on next view.`}
                            autosize
                            minRows={3}
                            maxRows={8}
                            maxLength={DATA_APP_ANALYSIS_INSTRUCTIONS_MAX_CHARS}
                            disabled={disabled}
                            {...form.getInputProps('instructions')}
                        />
                        <Group justify="flex-end">
                            {!isUnchanged && !updateSettings.isLoading && (
                                <Button
                                    variant="outline"
                                    onClick={() =>
                                        form.setValues({
                                            instructions: initialValue,
                                        })
                                    }
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
            </SettingsCard>
        </SettingsSection>
    );
};

const LimitsForm: FC<{
    initialLimits: DataAppAnalysisLimits;
    disabled: boolean;
}> = ({ initialLimits, disabled }) => {
    const updateSettings = useUpdateAiOrganizationSettings();
    const initialValues = toFormValues(initialLimits);
    const form = useForm({
        initialValues,
        validate: {
            investigateMaxSteps: requiredLimit,
            investigateMaxWarehouseQueries: requiredLimit,
        },
    });
    const isUnchanged = LIMIT_FIELDS.every(
        ({ key }) => form.values[key] === initialValues[key],
    );
    const handleSubmit = form.onSubmit((values) => {
        updateSettings.mutate({ dataAppAnalysisLimits: toLimits(values) });
    });

    return (
        <SettingsSection
            label="Limits"
            description={`Caps on how much AI analysis your organization can run. Daily caps count across all apps and viewers and reset each UTC day. On the built-in AI key they cannot exceed ${DATA_APP_ANALYSIS_DEFAULT_LIMITS.dailyDetectCap} analyses and ${DATA_APP_ANALYSIS_DEFAULT_LIMITS.dailyInvestigateCap} investigations; on your own key they apply as set.`}
        >
            <SettingsCard>
                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        {LIMIT_FIELDS.map((field) => (
                            <NumberInput
                                key={field.key}
                                label={field.label}
                                description={field.description}
                                placeholder={
                                    field.nullable ? 'No cap' : undefined
                                }
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
                                    onClick={() =>
                                        form.setValues(initialValues)
                                    }
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
            </SettingsCard>
        </SettingsSection>
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
            description="Let viewers analyse what a data app or dashboard shows and investigate notable data points."
            actions={
                <SettingsPageDocumentationLink href="https://docs.lightdash.com/data-apps/ai-analysis" />
            }
        >
            {isInitialLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <>
                    {!aiOn && (
                        <Callout variant="warning" title="AI is not enabled">
                            AI analysis needs Ask AI enabled for the
                            organization. Turn it on under{' '}
                            <Text
                                span
                                inherit
                                component={Link}
                                to="/generalSettings/ai/general"
                                td="underline"
                            >
                                Ask AI · General
                            </Text>
                            .
                        </Callout>
                    )}
                    <SettingsSection label="Availability" description={null}>
                        <SettingsCard>
                            <Stack gap="md">
                                <SettingRow
                                    icon={IconSparkles}
                                    title="AI analysis"
                                    description="Lets viewers analyse the current view of any data app or dashboard. Sends query results a viewer already has access to, to your configured AI provider."
                                    control={
                                        <Switch
                                            size="md"
                                            aria-label="AI analysis"
                                            checked={analysisOn}
                                            disabled={isUpdating || !aiOn}
                                            onChange={(event) =>
                                                updateSettings({
                                                    dataAppRuntimeAiEnabled:
                                                        event.currentTarget
                                                            .checked,
                                                })
                                            }
                                        />
                                    }
                                />
                                <Divider />
                                <SettingRow
                                    icon={IconMessageChatbot}
                                    title="Continue investigations in Ask AI"
                                    description="Lets viewers carry an investigation on as an Ask AI thread. The thread stays read-only. Off keeps viewers at the explanation."
                                    control={
                                        <Switch
                                            size="md"
                                            aria-label="Continue investigations in Ask AI"
                                            checked={
                                                settings.dataAppContinueInAskAiEnabled ??
                                                true
                                            }
                                            disabled={
                                                isUpdating ||
                                                !aiOn ||
                                                !analysisOn
                                            }
                                            onChange={(event) =>
                                                updateSettings({
                                                    dataAppContinueInAskAiEnabled:
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
                    <InstructionsForm
                        key={settings.dataAppAnalysisDefaultInstructions ?? ''}
                        initialInstructions={
                            settings.dataAppAnalysisDefaultInstructions ?? null
                        }
                        disabled={isUpdating || !aiOn || !analysisOn}
                    />
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
                </>
            )}
        </SettingsPage>
    );
};
