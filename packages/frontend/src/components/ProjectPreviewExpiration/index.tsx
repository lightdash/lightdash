import {
    Box,
    Button,
    Code,
    Group,
    Loader,
    NumberInput,
    Stack,
    Text,
    Title,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import { type FC } from 'react';
import {
    usePreviewExpirationSettings,
    useUpdatePreviewExpirationSettings,
} from '../../hooks/useProjectPreviewExpirationSettings';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

const formatHoursAsDays = (hours: number) => {
    if (Number.isNaN(hours)) return null;
    const days = hours / 24;
    if (Number.isInteger(days)) {
        return `≈ ${days} day${days === 1 ? '' : 's'}`;
    }
    return `≈ ${days.toFixed(1)} days`;
};

type FormValues = {
    defaultHours: number | '';
    maxHours: number | '';
};

type FormProps = {
    projectUuid: string;
    initialDefaultHours: number;
    initialMaxHours: number;
};

const ProjectPreviewExpirationForm: FC<FormProps> = ({
    projectUuid,
    initialDefaultHours,
    initialMaxHours,
}) => {
    const { mutate: updateSettings, isLoading: isUpdating } =
        useUpdatePreviewExpirationSettings(projectUuid);

    const form = useForm<FormValues>({
        initialValues: {
            defaultHours: initialDefaultHours,
            maxHours: initialMaxHours,
        },
        validate: {
            defaultHours: (value, values) => {
                if (typeof value !== 'number' || value < 1) {
                    return 'Must be a whole number of hours, at least 1';
                }
                if (
                    typeof values.maxHours === 'number' &&
                    value > values.maxHours
                ) {
                    return 'Must be less than or equal to the maximum';
                }
                return null;
            },
            maxHours: (value) =>
                typeof value !== 'number' || value < 1
                    ? 'Must be a whole number of hours, at least 1'
                    : null,
        },
    });

    return (
        <form
            onSubmit={form.onSubmit(({ defaultHours, maxHours }) => {
                if (
                    typeof defaultHours === 'number' &&
                    typeof maxHours === 'number'
                ) {
                    updateSettings({
                        defaultPreviewExpirationHours: defaultHours,
                        maxPreviewExpirationHours: maxHours,
                    });
                }
            })}
        >
            <Stack gap="md">
                <NumberInput
                    label="Default preview expiration (hours)"
                    min={1}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        typeof form.values.defaultHours === 'number' ? (
                            <Text c="ldGray.6" fz="xs">
                                {formatHoursAsDays(form.values.defaultHours)}
                            </Text>
                        ) : null
                    }
                    disabled={isUpdating}
                    {...form.getInputProps('defaultHours')}
                />

                <NumberInput
                    label="Maximum preview expiration (hours)"
                    min={1}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        typeof form.values.maxHours === 'number' ? (
                            <Text c="ldGray.6" fz="xs">
                                {formatHoursAsDays(form.values.maxHours)}
                            </Text>
                        ) : null
                    }
                    disabled={isUpdating}
                    {...form.getInputProps('maxHours')}
                />

                <Group justify="flex-end">
                    <Button type="submit" loading={isUpdating}>
                        Save
                    </Button>
                </Group>
            </Stack>
        </form>
    );
};

type Props = {
    projectUuid: string;
};

const ProjectPreviewExpiration: FC<Props> = ({ projectUuid }) => {
    const { data: settings, isLoading } =
        usePreviewExpirationSettings(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={4}>Preview projects</Title>
                <Text c="ldGray.6" fz="xs">
                    Control how long preview projects created from this project
                    stick around before they're auto-deleted. Users can override
                    the duration with <Code>--expires-in</Code>, but values
                    above the maximum are silently capped.
                </Text>
            </Box>
            {isLoading || !settings ? (
                <Loader size="sm" />
            ) : (
                <ProjectPreviewExpirationForm
                    projectUuid={projectUuid}
                    initialDefaultHours={settings.defaultPreviewExpirationHours}
                    initialMaxHours={settings.maxPreviewExpirationHours}
                />
            )}
        </SettingsGridCard>
    );
};

export default ProjectPreviewExpiration;
