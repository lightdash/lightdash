import { type RegistryChartTypeListItem } from '@lightdash/common';
import { Checkbox, Group, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useUpgradeAllRegistryChartTypes } from '../hooks/useInstallRegistryChartType';
import { getChartTypeIcon } from '../utils/chartTypeIcons';

type Props = {
    projectUuid: string;
    /** Registry entries with an update available for an installed chart type. */
    updates: RegistryChartTypeListItem[];
    onClose: () => void;
};

/** Confirmation for upgrading every installed chart type that has an update. */
const ChartTypeUpgradeAllModal: FC<Props> = ({
    projectUuid,
    updates,
    onClose,
}) => {
    const { t } = useTranslation('chartTypes');
    const { track } = useTracking();
    const upgradeAll = useUpgradeAllRegistryChartTypes();
    const [upgradeConsumingCharts, setUpgradeConsumingCharts] = useState(false);
    const count = updates.length;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={t('upgradeAll.title', { count })}
            confirmLabel={t('library.upgradeAll')}
            onConfirm={() => {
                updates.forEach((chart) =>
                    track({
                        name: EventName.CHART_TYPE_LIBRARY_INSTALL_CLICKED,
                        properties: {
                            projectUuid,
                            chartSlug: chart.slug,
                            action: 'upgrade',
                        },
                    }),
                );
                upgradeAll.mutate(
                    {
                        projectUuid,
                        charts: updates.map(({ slug, name }) => ({
                            slug,
                            name,
                        })),
                        upgradeConsumingCharts,
                    },
                    { onSuccess: onClose },
                );
            }}
            confirmLoading={upgradeAll.isLoading}
            cancelDisabled={upgradeAll.isLoading}
        >
            <Stack gap="md">
                <Stack gap="xs">
                    {updates.map((chart) => (
                        <Group
                            key={chart.slug}
                            gap="xs"
                            wrap="nowrap"
                            justify="space-between"
                        >
                            <Group gap="xs" wrap="nowrap">
                                <MantineIcon
                                    icon={getChartTypeIcon(chart.icon)}
                                    size={14}
                                    color="dimmed"
                                />
                                <Text fz="sm">{chart.name}</Text>
                            </Group>
                            <Text fz="xs" c="dimmed">
                                {chart.installedRegistryVersion
                                    ? `v${chart.installedRegistryVersion} → v${chart.version}`
                                    : `v${chart.version}`}
                            </Text>
                        </Group>
                    ))}
                </Stack>
                <Text fz="sm" c="dimmed">
                    {t('upgradeAll.explanation')}
                </Text>
                <Checkbox
                    checked={upgradeConsumingCharts}
                    onChange={(event) =>
                        setUpgradeConsumingCharts(event.currentTarget.checked)
                    }
                    label={t('upgradeAll.alsoMove')}
                    description={t('upgradeAll.alsoMoveDescription')}
                />
            </Stack>
        </MantineModal>
    );
};

export default ChartTypeUpgradeAllModal;
