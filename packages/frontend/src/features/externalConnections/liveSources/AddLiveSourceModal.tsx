import { ApiConnectorType } from '@lightdash/common';
import {
    Center,
    Group,
    Loader,
    SimpleGrid,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import clsx from 'clsx';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import styles from './AddLiveSourceModal.module.css';
import { CustomLiveSourceRequest } from './CustomLiveSourceRequest';
import { isGoogleConnector } from './googleConnection';
import { LiveSourceBetaTitle } from './LiveSourceBetaBadge';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
    type AvailableLiveSource,
    getLiveSourceIconClass,
} from './liveSourceCatalog';

const CUSTOM_LIVE_SOURCE_ID = 'custom';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    canUseGoogle: boolean;
    canUseLinkedInAds: boolean;
    canUseSalesforce: boolean;
    /** Hydra, the test integration, only where the server registers it. */
    canUseHydra: boolean;
    /**
     * The integrations the organization has turned on, by their feature
     * flags; undefined while they load.
     */
    enabledIntegrations: readonly ApiConnectorType[] | undefined;
    /** Whether loading the turned-on integrations failed. */
    isEnabledIntegrationsError: boolean;
    onPick: (connector: ApiConnectorType) => void;
};

const CardHead: FC<{ entry: AvailableLiveSource }> = ({ entry }) => (
    <Group gap="sm" wrap="nowrap" align="flex-start">
        <img
            src={entry.icon}
            alt=""
            className={clsx(styles.icon, getLiveSourceIconClass(entry.icon))}
        />
        <Stack gap={2} miw={0}>
            <Text fw={600} fz="sm" truncate>
                {entry.label}
            </Text>
            <Text fz="xs" c="dimmed" lineClamp={2}>
                {entry.description}
            </Text>
        </Stack>
    </Group>
);

export const AddLiveSourceModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    canUseGoogle,
    canUseLinkedInAds,
    canUseSalesforce,
    canUseHydra,
    enabledIntegrations,
    isEnabledIntegrationsError,
    onPick,
}) => {
    const { user } = useApp();
    const { track } = useTracking();
    // Only what this instance can connect: Google sources need its Google
    // sign-in, LinkedIn Ads and Salesforce an app most servers won't have,
    // and only what the organization has turned on.
    const isConnectable = (connector: ApiConnectorType) => {
        if (!enabledIntegrations?.includes(connector)) return false;
        if (isGoogleConnector(connector)) return canUseGoogle;
        if (connector === ApiConnectorType.LINKEDIN_ADS)
            return canUseLinkedInAds;
        if (connector === ApiConnectorType.SALESFORCE) return canUseSalesforce;
        if (connector === ApiConnectorType.HYDRA) return canUseHydra;
        return true;
    };
    const entries = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource).filter(
        (entry) => isConnectable(entry.connector),
    );

    const requestCustom = (customIntegrationName: string) => {
        track({
            name: EventName.LIVE_DATA_SOURCE_REQUESTED,
            properties: {
                organizationId: user.data?.organizationUuid ?? null,
                projectId: projectUuid,
                integration: CUSTOM_LIVE_SOURCE_ID,
                customIntegrationName,
            },
        });
    };
    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={
                <LiveSourceBetaTitle>
                    Add a live data source
                </LiveSourceBetaTitle>
            }
            subtitle="Query the tools you use live, right alongside your warehouse"
            size="xl"
            cancelLabel={false}
        >
            <Stack gap="sm">
                {isEnabledIntegrationsError ? (
                    <Text fz="sm" c="red">
                        Couldn't load the integrations you can add. Close this
                        and try again.
                    </Text>
                ) : enabledIntegrations === undefined ? (
                    <Center py="lg">
                        <Loader size="sm" />
                    </Center>
                ) : (
                    <SimpleGrid cols={{ base: 1, xs: 2, sm: 3 }} spacing="sm">
                        {entries.map((entry) => (
                            <UnstyledButton
                                key={entry.id}
                                className={styles.card}
                                onClick={() => onPick(entry.connector)}
                            >
                                <CardHead entry={entry} />
                            </UnstyledButton>
                        ))}
                    </SimpleGrid>
                )}
                <CustomLiveSourceRequest onRequest={requestCustom} />
            </Stack>
        </MantineModal>
    );
};
