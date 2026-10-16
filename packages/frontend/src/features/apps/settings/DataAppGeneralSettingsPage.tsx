import { FeatureFlags } from '@lightdash/common';
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
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import Callout from '../../../components/common/Callout';
import ErrorState from '../../../components/common/ErrorState';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import useHealth from '../../../hooks/health/useHealth';
import {
    useOrganizationSettings,
    useUpdateOrganizationSettings,
} from '../../../hooks/organization/useOrganizationSettings';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

export const DataAppGeneralSettingsPage: FC = () => {
    const { t } = useTranslation('apps');
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

    const automaticThumbnailsFlag = useServerFeatureFlag(
        FeatureFlags.EnableDataAppAutomaticThumbnails,
    );

    const hasHeadlessBrowser = health.data?.hasHeadlessBrowser ?? false;
    const automaticThumbnailsAvailable =
        automaticThumbnailsFlag.data?.enabled === true;

    return (
        <SettingsPage
            title={t('generalSettings.title')}
            description={t('generalSettings.description')}
        >
            {isError ? (
                <SettingsCard>
                    <Stack align="center">
                        <ErrorState error={error?.error} hasMarginTop={false} />
                        <Button
                            variant="default"
                            onClick={() => void refetch()}
                        >
                            {t('generalSettings.tryAgain')}
                        </Button>
                    </Stack>
                </SettingsCard>
            ) : isInitialLoading ||
              !settings ||
              health.isInitialLoading ||
              automaticThumbnailsFlag.isInitialLoading ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : automaticThumbnailsAvailable ? (
                <Stack gap="md">
                    {!hasHeadlessBrowser && (
                        <Callout
                            variant="info"
                            title={t('generalSettings.noBrowser.title')}
                        >
                            <Text fz="xs">
                                {t('generalSettings.noBrowser.body')}
                            </Text>
                        </Callout>
                    )}
                    <SettingsCard>
                        <Group
                            justify="space-between"
                            wrap="nowrap"
                            align="flex-start"
                            gap="md"
                        >
                            <Box maw={620}>
                                <Title order={5} mb={4}>
                                    {t('generalSettings.thumbnails.title')}
                                </Title>
                                <Text c="dimmed" fz="xs">
                                    {t(
                                        'generalSettings.thumbnails.description',
                                    )}
                                </Text>
                            </Box>
                            <Switch
                                size="md"
                                aria-label={t(
                                    'generalSettings.thumbnails.ariaLabel',
                                )}
                                checked={
                                    settings.dataAppAutomaticThumbnailsEnabled !==
                                    false
                                }
                                disabled={isUpdating || !hasHeadlessBrowser}
                                onChange={(event) =>
                                    updateSettings({
                                        dataAppAutomaticThumbnailsEnabled:
                                            event.currentTarget.checked,
                                    })
                                }
                            />
                        </Group>
                    </SettingsCard>
                </Stack>
            ) : null}
        </SettingsPage>
    );
};
