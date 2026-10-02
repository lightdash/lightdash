import { FeatureFlags } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import { warehouseSignInStatusQueryKey } from '../../hooks/useWarehouseSignInStatus';
import { shouldOpenPersonalSignInModal } from './shouldOpenPersonalSignInModal';

type PersonalSignInPromptOptions = {
    activeProjectUuid: string | undefined;
    warehouseType: string | undefined;
    requireUserCredentials: boolean | undefined;
    pathname: string;
    isRouteThatNeedsWarehouseCredentials: boolean;
    compatibleCredentialsCount: number | undefined;
};

export const usePersonalSignInPrompt = ({
    activeProjectUuid,
    warehouseType,
    requireUserCredentials,
    pathname,
    isRouteThatNeedsWarehouseCredentials,
    compatibleCredentialsCount,
}: PersonalSignInPromptOptions) => {
    const [showCreateModalOnPageLoad, setShowCreateModalOnPageLoad] =
        useState(false);
    const [isCreatingCredentials, setIsCreatingCredentials] = useState(false);
    const [isExpiredSignIn, setIsExpiredSignIn] = useState(false);
    const openedProjects = useRef(new Set<string>());
    const invalidatedProjects = useRef(new Set<string>());
    const expiredSignInFlag = useServerFeatureFlag(
        FeatureFlags.ExpiredSignInState,
    );
    const queryClient = useQueryClient();

    useEffect(() => {
        const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
            if (event.type === 'updated') {
                const query = event.query;

                if (query.state.error) {
                    const error = query.state.error as {
                        error?: {
                            name?: string;
                            data?: { personalSignInExpired?: boolean };
                        };
                    };
                    const errorName = error.error?.name ?? '';
                    const personalSignInExpired =
                        expiredSignInFlag.data?.enabled === true &&
                        error.error?.data?.personalSignInExpired === true;
                    if (
                        personalSignInExpired &&
                        activeProjectUuid &&
                        !invalidatedProjects.current.has(activeProjectUuid)
                    ) {
                        invalidatedProjects.current.add(activeProjectUuid);
                        void queryClient.invalidateQueries({
                            queryKey:
                                warehouseSignInStatusQueryKey(
                                    activeProjectUuid,
                                ),
                        });
                    }
                    if (
                        expiredSignInFlag.data?.enabled === true &&
                        activeProjectUuid &&
                        shouldOpenPersonalSignInModal({
                            errorName,
                            personalSignInExpired,
                            requireUserCredentials:
                                requireUserCredentials === true,
                            warehouseType: warehouseType ?? '',
                            alreadyOpened:
                                openedProjects.current.has(activeProjectUuid),
                            pending: isCreatingCredentials,
                        })
                    ) {
                        openedProjects.current.add(activeProjectUuid);
                        setIsExpiredSignIn(personalSignInExpired);
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                    if (expiredSignInFlag.data?.enabled === true) return;
                    if (
                        error?.error?.name ===
                            'MissingWarehouseCredentialsError' &&
                        requireUserCredentials
                    ) {
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                    if (
                        error?.error?.name === 'SnowflakeTokenError' &&
                        warehouseType === 'snowflake' &&
                        requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for Snowflake');
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                    if (
                        error?.error?.name === 'DatabricksTokenError' &&
                        warehouseType === 'databricks' &&
                        requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for Databricks');
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                    if (
                        error?.error?.name === 'BigqueryTokenError' &&
                        warehouseType === 'bigquery' &&
                        requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for BigQuery');
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                    if (
                        error?.error?.name === 'RedshiftIamTokenError' &&
                        warehouseType === 'redshift' &&
                        requireUserCredentials
                    ) {
                        console.info('Triggering reauth modal for Redshift');
                        setShowCreateModalOnPageLoad(true);
                        setIsCreatingCredentials(true);
                    }
                }
            }
        });

        return unsubscribe;
    }, [
        queryClient,
        warehouseType,
        requireUserCredentials,
        activeProjectUuid,
        expiredSignInFlag.data?.enabled,
        isCreatingCredentials,
    ]);

    useEffect(() => {
        setShowCreateModalOnPageLoad(false);
        setIsExpiredSignIn(false);
        openedProjects.current.clear();
        invalidatedProjects.current.clear();
    }, [pathname]);

    useEffect(() => {
        const openRequestedSignIn = (event: Event) => {
            if (
                event instanceof CustomEvent &&
                event.detail === activeProjectUuid &&
                expiredSignInFlag.data?.enabled === true
            ) {
                setIsExpiredSignIn(true);
                setShowCreateModalOnPageLoad(true);
                setIsCreatingCredentials(true);
            }
        };
        window.addEventListener(
            'warehouse-sign-in-requested',
            openRequestedSignIn,
        );
        return () =>
            window.removeEventListener(
                'warehouse-sign-in-requested',
                openRequestedSignIn,
            );
    }, [activeProjectUuid, expiredSignInFlag.data?.enabled]);

    useEffect(() => {
        if (
            isRouteThatNeedsWarehouseCredentials &&
            !showCreateModalOnPageLoad &&
            requireUserCredentials &&
            compatibleCredentialsCount !== undefined &&
            compatibleCredentialsCount === 0
        ) {
            setShowCreateModalOnPageLoad(true);
            setIsCreatingCredentials(true);
            openedProjects.current.add(activeProjectUuid ?? '');
        }
    }, [
        isRouteThatNeedsWarehouseCredentials,
        showCreateModalOnPageLoad,
        compatibleCredentialsCount,
        activeProjectUuid,
        requireUserCredentials,
    ]);

    return {
        showCreateModalOnPageLoad,
        isCreatingCredentials,
        setIsCreatingCredentials,
        isExpiredSignIn,
        setIsExpiredSignIn,
    };
};
