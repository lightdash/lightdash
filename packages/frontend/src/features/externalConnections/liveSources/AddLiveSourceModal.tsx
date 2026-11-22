import { ApiConnectorType } from '@lightdash/common';
import { Group, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import clsx from 'clsx';
import { type FC } from 'react';
import MantineModal from '../../../components/common/MantineModal';
import useToaster from '../../../hooks/toaster/useToaster';
import useApp from '../../../providers/App/useApp';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import styles from './AddLiveSourceModal.module.css';
import { CustomLiveSourceRequestCard } from './CustomLiveSourceRequestCard';
import { isGoogleConnector } from './googleConnection';
import { LiveSourceBetaTitle } from './LiveSourceBetaBadge';
import {
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
    type AvailableLiveSource,
    getLiveSourceIconClass,
} from './liveSourceCatalog';
import { ProjectCacheOffAlert } from './ProjectCacheOffAlert';

const CUSTOM_LIVE_SOURCE_ID = 'custom';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    canUseGoogle: boolean;
    canUseLinkedInAds: boolean;
    canUseSalesforce: boolean;
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
    onPick,
}) => {
    const { user } = useApp();
    const { track } = useTracking();
    const { showToastSuccess } = useToaster();
    // Only what this instance can connect: Google sources need its Google
    // sign-in, LinkedIn Ads and Salesforce an app most servers won't have.
    const isConnectable = (connector: ApiConnectorType) => {
        if (isGoogleConnector(connector)) return canUseGoogle;
        if (connector === ApiConnectorType.LINKEDIN_ADS)
            return canUseLinkedInAds;
        if (connector === ApiConnectorType.SALESFORCE) return canUseSalesforce;
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
        showToastSuccess({
            title: `Requested ${customIntegrationName}`,
            subtitle: 'Thanks, it helps us choose what to add next',
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
            subtitle="Live data from the tools you use, queried on demand and joined with your warehouse."
            size="xl"
            cancelLabel={false}
        >
            <Stack gap="sm">
                <ProjectCacheOffAlert projectUuid={projectUuid} />
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
                    <CustomLiveSourceRequestCard onRequest={requestCustom} />
                </SimpleGrid>
            </Stack>
        </MantineModal>
    );
};
