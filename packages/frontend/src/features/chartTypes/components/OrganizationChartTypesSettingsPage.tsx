import { Group, Loader, Stack, Switch, Text, Title } from '@mantine/core';
import { IconBuildingSkyscraper } from '@tabler/icons-react';
import { type FC } from 'react';
import InlineErrorState from '../../../components/common/InlineErrorState';
import MantineIcon from '../../../components/common/MantineIcon';
import { SettingsCard } from '../../../components/common/Settings/SettingsCard';
import { SettingsPage } from '../../../components/common/Settings/SettingsPage';
import {
    useOrganizationChartTypesSetting,
    useUpdateOrganizationChartTypesSetting,
} from '../../../hooks/organization/useOrganizationChartTypesSetting';

export const OrganizationChartTypesSettingsPage: FC = () => {
    const {
        data: setting,
        isError,
        refetch,
    } = useOrganizationChartTypesSetting({ enabled: true });
    const { mutate: updateSetting, isLoading: isUpdating } =
        useUpdateOrganizationChartTypesSetting();

    return (
        <SettingsPage
            title="Chart types"
            description="Share chart types across every project in your organization."
        >
            {isError ? (
                <InlineErrorState
                    message="Failed to load the chart types setting"
                    onRetry={() => void refetch()}
                />
            ) : !setting ? (
                <Group justify="center" mt="xl">
                    <Loader size="sm" />
                </Group>
            ) : (
                <SettingsCard>
                    <Group wrap="nowrap" align="flex-start" gap="sm">
                        <MantineIcon
                            icon={IconBuildingSkyscraper}
                            size="lg"
                            color="ldGray.7"
                        />
                        <Stack gap={2} flex={1}>
                            <Title order={6}>Organization library</Title>
                            <Text c="dimmed" fz="xs">
                                Chart types in the organization library can be
                                used in every project.
                            </Text>
                        </Stack>
                        <Switch
                            size="md"
                            aria-label="Organization library"
                            checked={setting.enabled}
                            disabled={isUpdating}
                            onChange={(event) =>
                                updateSetting({
                                    enabled: event.currentTarget.checked,
                                })
                            }
                        />
                    </Group>
                </SettingsCard>
            )}
        </SettingsPage>
    );
};
