import { type AiDeepResearchLimits } from '@lightdash/common';
import { Button, Group, Loader, Stack, Text, Title } from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { useState } from 'react';
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

const DEEP_RESEARCH_LIMIT_FIELDS: Array<{
    key: keyof AiDeepResearchLimits;
    label: string;
    description: string;
}> = [
    {
        key: 'maxTokens',
        label: 'Maximum tokens',
        description:
            'The maximum total model tokens consumed across a deep research run.',
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
        key: 'maxHypotheses',
        label: 'Maximum hypotheses',
        description:
            'The maximum number of hypotheses generated for one deep research run.',
    },
];

const DeepResearchLimitsForm = ({
    initialLimits,
}: {
    initialLimits: AiDeepResearchLimits;
}) => {
    const [updatingLimit, setUpdatingLimit] = useState<
        keyof AiDeepResearchLimits | null
    >(null);
    const updateSettings = useUpdateAiOrganizationSettings({
        onSettled: () => setUpdatingLimit(null),
    });
    const form = useForm({ initialValues: initialLimits });

    const updateLimit = (key: keyof AiDeepResearchLimits) => {
        setUpdatingLimit(key);
        updateSettings.mutate({
            deepResearchLimits: {
                ...initialLimits,
                [key]: form.values[key],
            },
        });
    };

    return (
        <SettingsPage
            title="Deep research"
            description="Configure organization-wide safety limits for deep research runs."
        >
            <Stack gap="lg">
                {DEEP_RESEARCH_LIMIT_FIELDS.map((field) => (
                    <SettingsGridCard key={field.key}>
                        <div>
                            <Title order={5}>{field.label}</Title>
                            <Text c="ldGray.6" fz="xs">
                                {field.description}
                            </Text>
                        </div>

                        <form
                            onSubmit={(event) => {
                                event.preventDefault();
                                updateLimit(field.key);
                            }}
                        >
                            <Stack gap="md">
                                <NumberInput
                                    label={field.label}
                                    allowDecimal={false}
                                    allowNegative={false}
                                    thousandSeparator=","
                                    {...form.getInputProps(field.key)}
                                />
                                <Group justify="flex-end">
                                    <Button
                                        type="submit"
                                        loading={
                                            updateSettings.isLoading &&
                                            updatingLimit === field.key
                                        }
                                        disabled={
                                            updateSettings.isLoading ||
                                            form.values[field.key] ===
                                                initialLimits[field.key]
                                        }
                                    >
                                        Update
                                    </Button>
                                </Group>
                            </Stack>
                        </form>
                    </SettingsGridCard>
                ))}
            </Stack>
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
                key={[
                    settings.deepResearchLimits.maxTokens,
                    settings.deepResearchLimits.maxToolCalls,
                    settings.deepResearchLimits.maxWarehouseQueries,
                    settings.deepResearchLimits.maxHypotheses,
                ].join('-')}
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
