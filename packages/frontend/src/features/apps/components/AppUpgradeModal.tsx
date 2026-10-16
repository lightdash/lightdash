import { type ApiUpgradeAppResponse } from '@lightdash/common';
import { List, Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../../components/common/MantineModal';
import { type SdkUpgradeOffer } from '../hooks/useSdkUpgradeStatus';
import { useUpgradeApp } from '../hooks/useUpgradeApp';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    appUuid: string;
    offer: SdkUpgradeOffer;
    resource: 'dataApp' | 'chartType';
    onStarted?: (result: ApiUpgradeAppResponse['results']) => void;
};

/**
 * Owns the SDK upgrade request and confirmation copy. Data-app and chart-type
 * surfaces provide only their trigger and what should happen once a new
 * version starts.
 */
const AppUpgradeModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    appUuid,
    offer,
    resource,
    onStarted,
}) => {
    const { t } = useTranslation('apps');
    const { mutate, isLoading } = useUpgradeApp();
    const isChartType = resource === 'chartType';
    const kind = isChartType ? 'chartType' : 'app';
    const hasNewFeatures = offer.newFeatures.length > 0;
    const hasNewFixes = offer.newFixes.length > 0;
    const isFixesOnly =
        offer.status === 'stale' && !hasNewFeatures && hasNewFixes;

    const handleUpgrade = useCallback(() => {
        mutate(
            {
                projectUuid,
                appUuid,
                body: {
                    ...(offer.reportedSdkVersion !== null
                        ? { reportedSdkVersion: offer.reportedSdkVersion }
                        : {}),
                    ...(offer.reportedFeatures !== null
                        ? { reportedFeatures: offer.reportedFeatures }
                        : {}),
                    ...(offer.candidateFeatures.length > 0
                        ? {
                              candidateFeatures: offer.candidateFeatures.map(
                                  ({ key, label, description, wiring }) => ({
                                      key,
                                      label,
                                      description,
                                      ...(wiring ? { wiring } : {}),
                                  }),
                              ),
                          }
                        : {}),
                },
            },
            {
                onSuccess: (result) => {
                    onStarted?.(result);
                    onClose();
                },
            },
        );
    }, [appUuid, mutate, offer, onClose, onStarted, projectUuid]);

    const followUpCopy = isFixesOnly
        ? t(`upgrade.${kind}.followUpFixes`)
        : t(`upgrade.${kind}.followUpFeatures`);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={t(`upgrade.${kind}.title`)}
            icon={IconSparkles}
            confirmLabel={t('upgrade.start')}
            confirmLoading={isLoading}
            onConfirm={handleUpgrade}
        >
            <Stack gap="sm">
                {offer.status === 'stale' && (hasNewFeatures || hasNewFixes) ? (
                    <>
                        <Text size="sm">{t(`upgrade.${kind}.newSince`)}</Text>
                        {hasNewFeatures && (
                            <>
                                <Text size="sm" fw={500}>
                                    {t('upgrade.features')}
                                </Text>
                                <List spacing="xs" size="sm">
                                    {offer.newFeatures.map((feature) => (
                                        <List.Item key={feature.key}>
                                            <Text size="sm" fw={500} span>
                                                {feature.label}
                                            </Text>{' '}
                                            <Text size="sm" c="dimmed" span>
                                                — {feature.description}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                            </>
                        )}
                        {hasNewFixes && (
                            <>
                                <Text size="sm" fw={500}>
                                    {t('upgrade.fixes')}
                                </Text>
                                <List spacing="xs" size="sm">
                                    {offer.newFixes.map((fix) => (
                                        <List.Item key={fix.key}>
                                            <Text size="sm" fw={500} span>
                                                {fix.label}
                                            </Text>{' '}
                                            <Text size="sm" c="dimmed" span>
                                                — {fix.description}
                                            </Text>
                                        </List.Item>
                                    ))}
                                </List>
                            </>
                        )}
                    </>
                ) : offer.status === 'stale' ? (
                    <Text size="sm">{t(`upgrade.${kind}.stale`)}</Text>
                ) : offer.status === 'current' ? (
                    <Text size="sm">{t(`upgrade.${kind}.current`)}</Text>
                ) : (
                    <Text size="sm">{t(`upgrade.${kind}.legacy`)}</Text>
                )}
                {isChartType && (
                    <Text size="sm">
                        {t('upgrade.chartType.remainsAvailable')}
                    </Text>
                )}
                <Text size="sm" c="dimmed">
                    {followUpCopy}
                </Text>
            </Stack>
        </MantineModal>
    );
};

export default AppUpgradeModal;
