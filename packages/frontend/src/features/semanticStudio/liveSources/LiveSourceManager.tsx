/**
 * Everything an admin does to a live data source, wherever on the Semantic
 * Layer page they start it: add, edit, sign in again and remove. The dialogs
 * live here once, and sign-in callbacks (?connected=, ?signInError=,
 * ?pickGoogleSource=) and ?add=true land here, on whichever page they open.
 */
import { ApiConnectorType, assertUnreachable } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState, type FC, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import MantineModal from '../../../components/common/MantineModal';
import useHealth from '../../../hooks/health/useHealth';
import { useDeleteExternalConnection } from '../../externalConnections/hooks/useDeleteExternalConnection';
import { useLiveSourceFields } from '../../externalConnections/hooks/useLiveSourceFields';
import { AddLiveSourceModal } from '../../externalConnections/liveSources/AddLiveSourceModal';
import {
    getGoogleSignInUrl,
    isGoogleConnector,
} from '../../externalConnections/liveSources/googleConnection';
import { GoogleConnectionModal } from '../../externalConnections/liveSources/GoogleConnectionModal';
import { GoogleSourcePickerModal } from '../../externalConnections/liveSources/GoogleSourcePickerModal';
import { getLinkedInAdsSignInUrl } from '../../externalConnections/liveSources/linkedInAdsConnection';
import { LinkedInAdsConnectionModal } from '../../externalConnections/liveSources/LinkedInAdsConnectionModal';
import {
    formatChartCount,
    getLiveSource,
} from '../../externalConnections/liveSources/liveSourceCatalog';
import {
    getPostHogSignInUrl,
    toPostHogFormValues,
} from '../../externalConnections/liveSources/postHogConnection';
import { PostHogConnectionModal } from '../../externalConnections/liveSources/PostHogConnectionModal';
import { SourceConnectedModal } from '../../externalConnections/liveSources/SourceConnectedModal';
import { TokenLiveSourceModal } from '../../externalConnections/liveSources/TokenLiveSourceModal';
import { useLiveSourceSignInResult } from '../../externalConnections/liveSources/useLiveSourceSignInResult';
import {
    LiveSourceActionsContext,
    type LiveSourceActions,
} from './liveSourceActions';
import { type LiveSourceConnection } from './liveSourceRows';

type Dialog =
    | { kind: 'closed' }
    | { kind: 'pick' }
    | { kind: 'create'; connector: ApiConnectorType }
    | { kind: 'edit'; connection: LiveSourceConnection }
    | { kind: 'remove'; connection: LiveSourceConnection }
    | { kind: 'connected'; connectionUuid: string };

const RemoveLiveSourceModal: FC<{
    projectUuid: string;
    connection: LiveSourceConnection;
    onClose: () => void;
    onRemoved: () => void;
}> = ({ projectUuid, connection, onClose, onRemoved }) => {
    const queryClient = useQueryClient();
    const { mutate, isLoading } = useDeleteExternalConnection({
        deleted: 'Live data source deleted',
        failed: 'Failed to delete live data source',
    });
    const { data: fields } = useLiveSourceFields({
        projectUuid,
        connectionUuid: connection.externalConnectionUuid,
    });
    const chartCount = fields?.usedByChartCount;
    const chartsNote =
        chartCount === 0
            ? ''
            : ` ${
                  chartCount === undefined
                      ? 'Charts on it'
                      : `${formatChartCount(chartCount)} ${chartCount === 1 ? 'uses it. It' : 'use it. They'}`
              } will stop working until you reattach a source.`;
    return (
        <MantineModal
            opened
            onClose={onClose}
            title="Delete live data source"
            variant="delete"
            description={`"${connection.name}" will be disconnected and its explores removed.${chartsNote}`}
            cancelDisabled={isLoading}
            confirmLoading={isLoading}
            onConfirm={() =>
                mutate(
                    {
                        projectUuid,
                        connectionUuid: connection.externalConnectionUuid,
                    },
                    {
                        // Its explores go with it. A failure keeps the
                        // dialog open; the hook already says why.
                        onSuccess: async () => {
                            await queryClient.invalidateQueries({
                                queryKey: ['tables'],
                            });
                            onRemoved();
                        },
                    },
                )
            }
        />
    );
};

export const LiveSourceManager: FC<{
    projectUuid: string;
    /** Whether the person manages live data sources; otherwise a no-op. */
    enabled: boolean;
    /** Where to go after a source is deleted, so its page doesn't linger. */
    onRemoved: () => void;
    children: ReactNode;
}> = ({ projectUuid, enabled, onRemoved, children }) => {
    const [dialog, setDialog] = useState<Dialog>({ kind: 'closed' });
    const close = () => setDialog({ kind: 'closed' });
    const { data: health } = useHealth();
    const canSignIn = health?.hasPostHogOAuth ?? false;
    const canUseGoogle = health?.hasGoogleLiveSources ?? false;
    const canUseLinkedInAds = health?.hasLinkedInAdsOAuth ?? false;

    const actions = useMemo(
        (): LiveSourceActions => ({
            add: () => setDialog({ kind: 'pick' }),
            edit: (connection) => setDialog({ kind: 'edit', connection }),
            remove: (connection) => setDialog({ kind: 'remove', connection }),
            getReconnect: (connection) => {
                const { connector } = connection.apiSource;
                const { setup } = getLiveSource(connector);
                switch (setup.kind) {
                    case 'google':
                        return canUseGoogle && isGoogleConnector(connector)
                            ? () =>
                                  window.location.assign(
                                      getGoogleSignInUrl(
                                          projectUuid,
                                          connector,
                                          connection.name,
                                          connection.externalConnectionUuid,
                                          'settings',
                                      ),
                                  )
                            : null;
                    case 'posthog':
                        return canSignIn
                            ? () =>
                                  window.location.assign(
                                      getPostHogSignInUrl(
                                          projectUuid,
                                          toPostHogFormValues(
                                              connection,
                                              canSignIn,
                                          ),
                                          connection.externalConnectionUuid,
                                          'settings',
                                      ),
                                  )
                            : null;
                    // A token is edited from the source's own form
                    case 'token':
                        return null;
                    case 'linkedin_ads': {
                        const { apiSource } = connection;
                        return canUseLinkedInAds &&
                            apiSource.connector ===
                                ApiConnectorType.LINKEDIN_ADS
                            ? () =>
                                  window.location.assign(
                                      getLinkedInAdsSignInUrl(
                                          projectUuid,
                                          {
                                              name: connection.name,
                                              adAccountId:
                                                  apiSource.adAccountId,
                                          },
                                          connection.externalConnectionUuid,
                                          'settings',
                                      ),
                                  )
                            : null;
                    }
                    default:
                        return assertUnreachable(setup, 'Unknown source setup');
                }
            },
        }),
        [projectUuid, canSignIn, canUseGoogle, canUseLinkedInAds],
    );

    if (!enabled) return <>{children}</>;
    return (
        <LiveSourceActionsContext.Provider value={actions}>
            {children}
            <LiveSourceDialogs
                projectUuid={projectUuid}
                dialog={dialog}
                setDialog={setDialog}
                close={close}
                canSignIn={canSignIn}
                canUseGoogle={canUseGoogle}
                canUseLinkedInAds={canUseLinkedInAds}
                onRemoved={onRemoved}
            />
        </LiveSourceActionsContext.Provider>
    );
};

const LiveSourceConnectDialog: FC<{
    projectUuid: string;
    connector: ApiConnectorType;
    connection: LiveSourceConnection | null;
    canSignIn: boolean;
    onClose: () => void;
    onCreated: (connectionUuid: string) => void;
}> = ({
    projectUuid,
    connector,
    connection,
    canSignIn,
    onClose,
    onCreated,
}) => {
    const { setup } = getLiveSource(connector);
    switch (setup.kind) {
        case 'google':
            return isGoogleConnector(connector) ? (
                <GoogleConnectionModal
                    opened
                    onClose={onClose}
                    projectUuid={projectUuid}
                    connector={connector}
                    connection={connection}
                />
            ) : null;
        case 'posthog':
            return (
                <PostHogConnectionModal
                    opened
                    onClose={onClose}
                    projectUuid={projectUuid}
                    connection={connection}
                    canSignIn={canSignIn}
                    onCreated={onCreated}
                />
            );
        case 'token':
            return (
                <TokenLiveSourceModal
                    form={setup.form}
                    opened
                    onClose={onClose}
                    projectUuid={projectUuid}
                    connection={connection}
                    onCreated={onCreated}
                />
            );
        case 'linkedin_ads':
            return (
                <LinkedInAdsConnectionModal
                    opened
                    onClose={onClose}
                    projectUuid={projectUuid}
                    connection={connection}
                />
            );
        default:
            return assertUnreachable(setup, 'Unknown source setup');
    }
};

const LiveSourceDialogs: FC<{
    projectUuid: string;
    dialog: Dialog;
    setDialog: (dialog: Dialog) => void;
    close: () => void;
    canSignIn: boolean;
    canUseGoogle: boolean;
    canUseLinkedInAds: boolean;
    onRemoved: () => void;
}> = ({
    projectUuid,
    dialog,
    setDialog,
    close,
    canSignIn,
    canUseGoogle,
    canUseLinkedInAds,
    onRemoved,
}) => {
    const { isPickingGoogleSource, closeGoogleSourcePicker } =
        useLiveSourceSignInResult({
            onConnected: (connectionUuid) =>
                setDialog({ kind: 'connected', connectionUuid }),
        });
    // ?add=true, from older links, opens the add flow.
    const [searchParams, setSearchParams] = useSearchParams();
    useEffect(() => {
        if (searchParams.get('add') !== 'true') return;
        setDialog({ kind: 'pick' });
        searchParams.delete('add');
        setSearchParams(searchParams, { replace: true });
    }, [searchParams, setSearchParams, setDialog]);

    const connector =
        dialog.kind === 'create'
            ? dialog.connector
            : dialog.kind === 'edit'
              ? dialog.connection.apiSource.connector
              : null;
    const connection = dialog.kind === 'edit' ? dialog.connection : null;
    // A fresh form per source, so editing one after another never mixes them.
    const formKey = connection?.externalConnectionUuid ?? connector ?? '';

    return (
        <>
            <AddLiveSourceModal
                opened={dialog.kind === 'pick'}
                onClose={close}
                projectUuid={projectUuid}
                canUseGoogle={canUseGoogle}
                canUseLinkedInAds={canUseLinkedInAds}
                onPick={(picked) =>
                    setDialog({ kind: 'create', connector: picked })
                }
            />
            {connector !== null && (
                <LiveSourceConnectDialog
                    key={formKey}
                    projectUuid={projectUuid}
                    connector={connector}
                    connection={connection}
                    canSignIn={canSignIn}
                    onClose={close}
                    onCreated={(connectionUuid) =>
                        setDialog({ kind: 'connected', connectionUuid })
                    }
                />
            )}
            {isPickingGoogleSource && (
                <GoogleSourcePickerModal
                    projectUuid={projectUuid}
                    onClose={closeGoogleSourcePicker}
                    onConnected={(connectionUuid) => {
                        closeGoogleSourcePicker();
                        setDialog({ kind: 'connected', connectionUuid });
                    }}
                />
            )}
            {dialog.kind === 'connected' && (
                <SourceConnectedModal
                    projectUuid={projectUuid}
                    connectionUuid={dialog.connectionUuid}
                    onClose={close}
                />
            )}
            {dialog.kind === 'remove' && (
                <RemoveLiveSourceModal
                    projectUuid={projectUuid}
                    connection={dialog.connection}
                    onClose={close}
                    onRemoved={() => {
                        close();
                        onRemoved();
                    }}
                />
            )}
        </>
    );
};
