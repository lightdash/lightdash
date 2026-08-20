import { type ApiUpgradeAppResponse } from '@lightdash/common';
import { List, Stack, Text } from '@mantine/core';
import { IconSparkles } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
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
    const { mutate, isLoading } = useUpgradeApp();
    const isChartType = resource === 'chartType';
    const noun = isChartType ? 'chart type' : 'app';

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
                        ? { candidateFeatures: offer.candidateFeatures }
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

    const followUpCopy = isChartType
        ? 'When it is ready, Version History will show what is now active and what you can ask the builder to add. Ask for them in the prompt bar; nothing that changes your chart is added automatically.'
        : 'When it is ready, chat will show what is now active and what you can ask the builder to add. Ask for them in chat; nothing that changes your app is added automatically.';

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={`Upgrade ${noun}`}
            icon={IconSparkles}
            confirmLabel="Start upgrade"
            confirmLoading={isLoading}
            onConfirm={handleUpgrade}
        >
            <Stack gap="sm">
                {offer.status === 'stale' ? (
                    <>
                        <Text size="sm">
                            This creates a new version of the {noun} using the
                            latest SDK. New since this version was built:
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
                ) : offer.status === 'current' ? (
                    <Text size="sm">
                        This {noun} is already on the latest SDK. Upgrading
                        again creates a new version from the current template.
                    </Text>
                ) : (
                    <Text size="sm">
                        This {noun} was built on an older SDK that cannot report
                        its exact capabilities. Upgrading creates a new version
                        from the latest template.
                    </Text>
                )}
                {isChartType && (
                    <Text size="sm">
                        The current chart remains available while the upgrade
                        builds. Its fields, options and defaults stay unchanged.
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
