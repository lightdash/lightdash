import { type AiDeepResearchLimits } from '@lightdash/common';
import { Button, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useForm } from '@mantine/form';
import ErrorState from '../../../../../../components/common/ErrorState';
import { NumberInput } from '../../../../../../components/common/NumberInput';
import {
    SettingsCard,
    SettingsGridCard,
} from '../../../../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../../../../components/common/Settings/SettingsPage';
import {
    useAiOrganizationSettings,
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
    label: string;
    description: string;
}> = [
    {
        key: 'maxSteps',
        label: 'Maximum steps',
        description:
            'The maximum number of model steps the coordinator may take in a deep research run.',
    },
    {
        key: 'maxToolCalls',
        label: 'Maximum tool calls',
        description:
            'The maximum number of tool calls across a deep research run.',
    },
    {
        key: 'maxWarehouseQueries',
        label: 'Maximum warehouse queries',
        description:
            'The maximum number of warehouse queries across a deep research run.',
    },
    {
        key: 'maxTokens',
        label: 'Maximum tokens',
        description:
            'The maximum total model tokens consumed across a deep research run.',
    },
    {
        key: 'deadlineMinutes',
        label: 'Time limit (minutes)',
        description:
            'The wall-clock limit for a deep research run before it stops and reports what it has.',
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
        <SettingsPage
            title="Deep research"
            description="Configure organization-wide safety limits for deep research runs."
        >
            <SettingsGridCard>
                <div>
                    <Title order={5}>Run limits</Title>
                    <Text c="ldGray.6" fz="xs">
                        Ceilings applied to every deep research run in your
                        organization. A run that reaches any of these limits
                        stops and reports what it has.
                    </Text>
                </div>

                <form onSubmit={handleSubmit}>
                    <Stack gap="md">
                        {LIMIT_FIELDS.map((field) => (
                            <NumberInput
                                key={field.key}
                                label={field.label}
                                description={field.description}
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
                                    Cancel
                                </Button>
                            )}
                            <Button
                                type="submit"
                                loading={updateSettings.isLoading}
                                disabled={isUnchanged}
                            >
                                Update
                            </Button>
                        </Group>
                    </Stack>
                </form>
            </SettingsGridCard>
        </SettingsPage>
    );
};

export const AiDeepResearchSettingsPage = () => {
    const {
        data: settings,
        isInitialLoading,
        isError,
        error,
        refetch,
    } = useAiOrganizationSettings();

    if (!isInitialLoading && !isError && settings) {
        return (
            <DeepResearchLimitsForm
                key={Object.values(settings.deepResearchLimits).join('-')}
                initialLimits={settings.deepResearchLimits}
            />
        );
    }

    return (
        <SettingsPage
            title="Deep research"
            description="Configure organization-wide safety limits for deep research runs."
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
                            Try again
                        </Button>
                    </Stack>
                )}
            </SettingsCard>
        </SettingsPage>
    );
};
