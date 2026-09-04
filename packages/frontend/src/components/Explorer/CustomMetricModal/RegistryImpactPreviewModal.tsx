import { type DashboardCustomMetricAffectedChart } from '@lightdash/common';
import { Button, Group, List, Stack, Text } from '@mantine/core';
import { IconChartBar, IconShare2 } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

type Props = {
    opened: boolean;
    metricLabel: string;
    affectedCharts: DashboardCustomMetricAffectedChart[];
    isSaving: boolean;
    onBack: () => void;
    onConfirm: () => void;
};

/**
 * Impact preview for a registry metric edit: names every chart the
 * write-through will rewrite before anything is committed.
 */
const RegistryImpactPreviewModal: FC<Props> = ({
    opened,
    metricLabel,
    affectedCharts,
    isSaving,
    onBack,
    onConfirm,
}) => (
    <MantineModal
        opened={opened}
        onClose={onBack}
        title="Update metric in this dashboard"
        icon={IconShare2}
        cancelLabel={false}
        actions={
            <Group gap="xs">
                <Button variant="default" onClick={onBack} disabled={isSaving}>
                    Back
                </Button>
                <Button onClick={onConfirm} loading={isSaving}>
                    {affectedCharts.length > 0
                        ? `Update metric and ${affectedCharts.length} chart${
                              affectedCharts.length === 1 ? '' : 's'
                          }`
                        : 'Update metric'}
                </Button>
            </Group>
        }
    >
        <Stack gap="sm">
            <Text size="sm">
                <Text span fw={600}>
                    {metricLabel}
                </Text>{' '}
                is shared with every chart in this dashboard.
            </Text>
            {affectedCharts.length > 0 ? (
                <>
                    <Text size="sm">
                        These charts use it and will be updated:
                    </Text>
                    <List spacing="xs" size="sm" center>
                        {affectedCharts.map((chart) => (
                            <List.Item
                                key={chart.uuid}
                                icon={
                                    <MantineIcon
                                        icon={IconChartBar}
                                        color="dimmed"
                                    />
                                }
                            >
                                {chart.name}
                            </List.Item>
                        ))}
                    </List>
                </>
            ) : (
                <Text size="sm" c="dimmed">
                    No saved charts use it yet — only the shared definition
                    changes.
                </Text>
            )}
            <Text size="xs" c="dimmed">
                Charts outside this dashboard are not affected.
            </Text>
        </Stack>
    </MantineModal>
);

export default RegistryImpactPreviewModal;
