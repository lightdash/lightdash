import { type RegistryChartTypeListItem } from '@lightdash/common';
import { Checkbox, Group, Stack, Text } from '@mantine/core';
import { useState, type FC } from 'react';
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
    const { track } = useTracking();
    const upgradeAll = useUpgradeAllRegistryChartTypes();
    const [upgradeConsumingCharts, setUpgradeConsumingCharts] = useState(false);
    const count = updates.length;

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={`Upgrade ${count} chart type${count === 1 ? '' : 's'}`}
            confirmLabel="Upgrade all"
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
                    Saved charts without a pinned version switch to the new
                    versions right away. Charts pinned to an earlier version
                    keep rendering it until each chart is upgraded.
                </Text>
                <Checkbox
                    checked={upgradeConsumingCharts}
                    onChange={(event) =>
                        setUpgradeConsumingCharts(event.currentTarget.checked)
                    }
                    label="Also move pinned saved charts to the new versions"
                    description="Deliberately overrides each chart's pin."
                />
            </Stack>
        </MantineModal>
    );
};

export default ChartTypeUpgradeAllModal;
