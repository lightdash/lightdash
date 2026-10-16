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
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import Callout from '../../../../components/common/Callout';
import MantineIcon from '../../../../components/common/MantineIcon';
import { NumberInput } from '../../../../components/common/NumberInput';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../components/common/Settings/SettingsCard';
import {
    SettingsPage,
    SettingsPageDocumentationLink,
} from '../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import i18n from '../../../../i18n/i18n';

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
    /** Empty means no cap. */
    nullable: boolean;
};

// Labels and descriptions live under `aiAnalysisSettings.limits.fields.<key>`.
const LIMIT_FIELDS: LimitField[] = [
    { key: 'dailyDetectCap', nullable: true },
    { key: 'dailyInvestigateCap', nullable: true },
    { key: 'dailyPromptCap', nullable: true },
    { key: 'investigateMaxSteps', nullable: false },
    { key: 'investigateMaxWarehouseQueries', nullable: false },
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
    value === ''
        ? i18n.t('aiAnalysisSettings.limits.required', { ns: 'apps' })
        : null;

const LimitsForm: FC<{
    initialLimits: DataAppAnalysisLimits;
    disabled: boolean;
}> = ({ initialLimits, disabled }) => {
    const { t } = useTranslation('apps');
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
        <SettingsGridCard>
            <Box>
                <Title order={5}>{t('aiAnalysisSettings.limits.title')}</Title>
                <Text c="dimmed" fz="xs">
                    {t('aiAnalysisSettings.limits.description', {
                        analyses:
                            DATA_APP_ANALYSIS_DEFAULT_LIMITS.dailyDetectCap,
                        investigations:
                            DATA_APP_ANALYSIS_DEFAULT_LIMITS.dailyInvestigateCap,
                    })}
                </Text>
            </Box>
            <form onSubmit={handleSubmit}>
                <Stack gap="md">
                    {LIMIT_FIELDS.map((field) => (
                        <NumberInput
                            key={field.key}
                            label={t(
                                `aiAnalysisSettings.limits.fields.${field.key}.label`,
                            )}
                            description={t(
                                `aiAnalysisSettings.limits.fields.${field.key}.description`,
                            )}
                            placeholder={
                                field.nullable
                                    ? t('aiAnalysisSettings.limits.noCap')
                                    : undefined
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
                                onClick={() => form.setValues(initialValues)}
                            >
                                {t('actions.cancel', { ns: 'common' })}
                            </Button>
                        )}
                        <Button
                            type="submit"
                            disabled={disabled || isUnchanged}
                            loading={updateSettings.isLoading}
                        >
                            {t('actions.save', { ns: 'common' })}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </SettingsGridCard>
    );
};

export const DataAppAiAnalysisSettingsPage: FC = () => {
    const { t } = useTranslation('apps');
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
            title={t('aiAnalysisSettings.title')}
            description={t('aiAnalysisSettings.description')}
            actions={
                <SettingsPageDocumentationLink href="https://docs.lightdash.com/data-apps/ai-analysis" />
            }
        >
            {isInitialLoading || !settings ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <Stack gap="md">
                    {!aiOn && (
                        <Callout
                            variant="warning"
                            title={t('aiAnalysisSettings.aiOff.title')}
                        >
                            <Text fz="xs">
                                <Trans
                                    t={t}
                                    i18nKey="aiAnalysisSettings.aiOff.body"
                                    components={{
                                        link: (
                                            <Text
                                                span
                                                component={Link}
                                                to="/generalSettings/ai/general"
                                                td="underline"
                                            />
                                        ),
                                    }}
                                />
                            </Text>
                        </Callout>
                    )}
                    <SettingsCard>
                        <Stack gap="md">
                            <SettingRow
                                icon={IconSparkles}
                                name={t('aiAnalysisSettings.enable.name')}
                                description={t(
                                    'aiAnalysisSettings.enable.description',
                                )}
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
                                name={t('aiAnalysisSettings.auto.name')}
                                description={t(
                                    'aiAnalysisSettings.auto.description',
                                )}
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
                                name={t('aiAnalysisSettings.continue.name')}
                                description={t(
                                    'aiAnalysisSettings.continue.description',
                                )}
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
