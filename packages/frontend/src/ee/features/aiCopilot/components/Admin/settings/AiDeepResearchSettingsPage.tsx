import { type AiDeepResearchLimits } from '@lightdash/common';
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
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import ErrorState from '../../../../../../components/common/ErrorState';
import { NumberInput } from '../../../../../../components/common/NumberInput';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import { isDeepResearchBeta } from '../../../deepResearch/deepResearchBeta';
import {
    useAiOrganizationAdminSettings,
    useUpdateAiOrganizationSettings,
} from '../../../hooks/useAiOrganizationSettings';

type LimitsFormValues = {
    maxSteps: number;
    maxToolCalls: number;
    maxWarehouseQueries: number;
    maxTokens: number;
    deadlineMinutes: number;
};

const LIMIT_FIELDS: Array<{
    key: keyof LimitsFormValues;
}> = [
    {
        key: 'maxSteps',
    },
    {
        key: 'maxToolCalls',
    },
    {
        key: 'maxWarehouseQueries',
    },
    {
        key: 'maxTokens',
    },
    {
        key: 'deadlineMinutes',
    },
];

const toFormValues = (limits: AiDeepResearchLimits): LimitsFormValues => ({
    maxSteps: limits.maxSteps,
    maxToolCalls: limits.maxToolCalls,
    maxWarehouseQueries: limits.maxWarehouseQueries,
    maxTokens: limits.maxTokens,
    deadlineMinutes: Math.round(limits.deadlineMs / 60_000),
});

const toLimits = (values: LimitsFormValues): AiDeepResearchLimits => ({
    maxSteps: values.maxSteps,
    maxToolCalls: values.maxToolCalls,
    maxWarehouseQueries: values.maxWarehouseQueries,
    maxTokens: values.maxTokens,
    deadlineMs: values.deadlineMinutes * 60_000,
});

const DeepResearchLimitsForm = ({
    initialLimits,
}: {
    initialLimits: AiDeepResearchLimits;
}) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const updateSettings = useUpdateAiOrganizationSettings();

    const initialValues = toFormValues(initialLimits);
    const form = useForm({ initialValues });

    const handleSubmit = form.onSubmit((values) => {
        updateSettings.mutate({ deepResearchLimits: toLimits(values) });
    });

    const isUnchanged = LIMIT_FIELDS.every(
        ({ key }) => form.values[key] === initialValues[key],
    );

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>{t('settings.deepResearch.runLimits')}</Title>
                <Text c="dimmed" fz="xs">
                    {t('settings.deepResearch.runLimitsDescription')}
                </Text>
            </Box>

            <form onSubmit={handleSubmit}>
                <Stack gap="md">
                    {LIMIT_FIELDS.map((field) => (
                        <NumberInput
                            key={field.key}
                            label={t(
                                `settings.deepResearch.fields.${field.key}.label`,
                            )}
                            description={t(
                                `settings.deepResearch.fields.${field.key}.description`,
                            )}
                            min={1}
                            allowDecimal={false}
                            allowNegative={false}
                            thousandSeparator=","
                            {...form.getInputProps(field.key)}
                        />
                    ))}
                    <Group justify="flex-end">
                        {!isUnchanged && !updateSettings.isLoading && (
                            <Button
                                variant="outline"
                                onClick={() => form.reset()}
                            >
                                {t('actions.cancel', { ns: 'common' })}
                            </Button>
                        )}
                        <Button
                            type="submit"
                            loading={updateSettings.isLoading}
                            disabled={isUnchanged}
                        >
                            {t('actions.update', { ns: 'common' })}
                        </Button>
                    </Group>
                </Stack>
            </form>
        </SettingsGridCard>
    );
};

const DeepResearchRawSqlSetting = ({ enabled }: { enabled: boolean }) => {
    const { t } = useTranslation('aiCopilotAdmin');
    const updateSettings = useUpdateAiOrganizationSettings();

    return (
        <SettingsCard>
            <Group
                justify="space-between"
                wrap="nowrap"
                align="flex-start"
                gap="md"
            >
                <Box flex={1}>
                    <Title order={5}>{t('settings.deepResearch.rawSql')}</Title>
                    <Text c="dimmed" fz="xs">
                        {t('settings.deepResearch.rawSqlDescription')}
                    </Text>
                </Box>
                <Switch
                    size="md"
                    aria-label={t('settings.deepResearch.rawSql')}
                    checked={enabled}
                    disabled={updateSettings.isLoading}
                    onChange={(event) =>
                        updateSettings.mutate({
                            deepResearchRawSqlEnabled:
                                event.currentTarget.checked,
                        })
                    }
                />
            </Group>
        </SettingsCard>
    );
};

export const AiDeepResearchSettingsPage = () => {
    const { t } = useTranslation('aiCopilotAdmin');
    const {
        data: settings,
        isInitialLoading,
        isError,
        error,
        refetch,
    } = useAiOrganizationAdminSettings();

    if (!isInitialLoading && !isError && settings) {
        return (
            <SettingsPage
                title={t('settings.deepResearch.title')}
                isBeta={isDeepResearchBeta}
                description={t('settings.deepResearch.description')}
            >
                <Stack gap="lg">
                    <DeepResearchRawSqlSetting
                        enabled={settings.deepResearchRawSqlEnabled}
                    />
                    <DeepResearchLimitsForm
                        key={Object.values(settings.deepResearchLimits).join(
                            '-',
                        )}
                        initialLimits={settings.deepResearchLimits}
                    />
                </Stack>
            </SettingsPage>
        );
    }

    return (
        <SettingsPage
            title={t('settings.deepResearch.title')}
            isBeta={isDeepResearchBeta}
            description={t('settings.deepResearch.description')}
        >
            <SettingsCard>
                {isInitialLoading ? (
                    <Group justify="center">
                        <Loader size="sm" />
                    </Group>
                ) : (
                    <Stack align="center">
                        <ErrorState error={error?.error} hasMarginTop={false} />
                        <Button
                            variant="default"
                            onClick={() => void refetch()}
                        >
                            {t('settings.deepResearch.tryAgain')}
                        </Button>
                    </Stack>
                )}
            </SettingsCard>
        </SettingsPage>
    );
};
