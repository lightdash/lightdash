import { type DashboardCustomMetricAffectedChart } from '@lightdash/common';
import { Button, Group, List, Stack, Text } from '@mantine/core';
import { IconChartBar, IconShare2 } from '@tabler/icons-react';
import { type FC } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';

type Props = {
    opened: boolean;
    variant?: 'update' | 'delete';
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
    variant = 'update',
    metricLabel,
    affectedCharts,
    isSaving,
    onBack,
    onConfirm,
}) => {
    const { t } = useTranslation('explorer');
    const isDelete = variant === 'delete';
    return (
        <MantineModal
            opened={opened}
            onClose={onBack}
            title={
                isDelete
                    ? t('registryImpact.removeTitle')
                    : t('registryImpact.updateTitle')
            }
            icon={IconShare2}
            cancelLabel={false}
            actions={
                <Group gap="xs">
                    <Button
                        variant="default"
                        onClick={onBack}
                        disabled={isSaving}
                    >
                        {t('actions.back', { ns: 'common' })}
                    </Button>
                    <Button
                        color={isDelete ? 'red' : undefined}
                        onClick={onConfirm}
                        loading={isSaving}
                    >
                        {isDelete
                            ? t('registryImpact.removeMetric')
                            : affectedCharts.length > 0
                              ? t('registryImpact.updateMetricAndCharts', {
                                    count: affectedCharts.length,
                                })
                              : t('registryImpact.updateMetric')}
                    </Button>
                </Group>
            }
        >
            <Stack gap="sm">
                <Text size="sm">
                    <Trans
                        t={t}
                        i18nKey="registryImpact.sharedWithDashboard"
                        values={{ metricLabel }}
                        components={{ metric: <Text span fw={600} /> }}
                    />
                </Text>
                {affectedCharts.length > 0 ? (
                    <>
                        <Text size="sm">
                            {isDelete
                                ? t('registryImpact.chartsKeepCopy')
                                : t('registryImpact.chartsWillUpdate')}
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
                        {isDelete
                            ? t('registryImpact.noChartsRemove')
                            : t('registryImpact.noChartsUpdate')}
                    </Text>
                )}
                <Text size="xs" c="dimmed">
                    {isDelete
                        ? t('registryImpact.noLongerOffered')
                        : t('registryImpact.outsideUnaffected')}
                </Text>
            </Stack>
        </MantineModal>
    );
};

export default RegistryImpactPreviewModal;
