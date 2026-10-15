import {
    Box,
    Button,
    Code,
    Group,
    Loader,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { type TFunction } from 'i18next';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import {
    usePreviewExpirationSettings,
    useUpdatePreviewExpirationSettings,
} from '../../hooks/useProjectPreviewExpirationSettings';
import { NumberInput } from '../common/NumberInput';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

const formatHoursAsDays = (hours: number, t: TFunction<'projectSettings'>) => {
    if (Number.isNaN(hours)) return null;
    const days = hours / 24;
    if (Number.isInteger(days)) {
        return t('previewExpiration.approxDays', { count: days });
    }
    return t('previewExpiration.approxDaysDecimal', {
        days: days.toFixed(1),
    });
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
    const { t } = useTranslation('projectSettings');
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
                    return t('previewExpiration.form.minHoursError');
                }
                if (
                    typeof values.maxHours === 'number' &&
                    value > values.maxHours
                ) {
                    return t('previewExpiration.form.exceedsMaxError');
                }
                return null;
            },
            maxHours: (value) =>
                typeof value !== 'number' || value < 1
                    ? t('previewExpiration.form.minHoursError')
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
                    label={t('previewExpiration.form.defaultLabel')}
                    min={1}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        typeof form.values.defaultHours === 'number' ? (
                            <Text c="dimmed" fz="xs">
                                {formatHoursAsDays(form.values.defaultHours, t)}
                            </Text>
                        ) : null
                    }
                    disabled={isUpdating}
                    {...form.getInputProps('defaultHours')}
                />

                <NumberInput
                    label={t('previewExpiration.form.maxLabel')}
                    min={1}
                    step={1}
                    rightSectionWidth={90}
                    rightSection={
                        typeof form.values.maxHours === 'number' ? (
                            <Text c="dimmed" fz="xs">
                                {formatHoursAsDays(form.values.maxHours, t)}
                            </Text>
                        ) : null
                    }
                    disabled={isUpdating}
                    {...form.getInputProps('maxHours')}
                />

                <Group justify="flex-end">
                    <Button type="submit" loading={isUpdating}>
                        {t('actions.save', { ns: 'common' })}
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
    const { t } = useTranslation('projectSettings');
    const { data: settings, isLoading } =
        usePreviewExpirationSettings(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>{t('previewExpiration.title')}</Title>
                <Text c="dimmed" fz="xs">
                    <Trans
                        t={t}
                        i18nKey="previewExpiration.description"
                        components={{ code: <Code /> }}
                    />
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
