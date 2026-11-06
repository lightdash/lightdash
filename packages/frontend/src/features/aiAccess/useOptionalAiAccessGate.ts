import {
    CommercialFeatureFlags,
    FeatureFlags,
    type AiAccessForUser,
    type ApiError,
    type FeatureFlag,
} from '@lightdash/common';
import {
    CancelledError,
    useQuery,
    type UseQueryResult,
} from '@tanstack/react-query';
import { useId, useLayoutEffect, useMemo, useState } from 'react';
import { type EmbedContext } from '../../ee/providers/Embed/types';
import useEmbed from '../../ee/providers/Embed/useEmbed';
import { useUiStrings } from '../../ee/providers/Embed/useUiStrings';
import useToaster from '../../hooks/toaster/useToaster';
import { type AppContext } from '../../providers/App/types';
import useApp from '../../providers/App/useApp';
import { useLightdashApi } from '../../providers/LightdashApi/useLightdashApi';
import { aiAccessApi } from './api';

const isEmbeddedSurface = (embed: EmbedContext) =>
    embed.mode === 'sdk' ||
    embed.projectUuid !== undefined ||
    embed.embedToken !== undefined ||
    embed.content !== undefined ||
    embed.embedWriteContext !== undefined;

const isRegisteredUserReady = ({ user, health }: AppContext) =>
    health.isSuccess &&
    !health.isFetching &&
    !health.isError &&
    health.data?.isAuthenticated === true &&
    user.isSuccess &&
    !user.isLoading &&
    !user.isFetching &&
    !user.isError &&
    !!user.data?.userUuid &&
    !!user.data?.organizationUuid;

const isFlagEnabled = (
    flag: Pick<
        UseQueryResult<FeatureFlag, ApiError>,
        'data' | 'isError' | 'isFetching'
    >,
) => !flag.isFetching && !flag.isError && flag.data?.enabled === true;

const isDiscoveryBlocked = (
    flag: Pick<
        UseQueryResult<FeatureFlag, ApiError>,
        'data' | 'isError' | 'isFetching'
    >,
    access: Pick<
        UseQueryResult<AiAccessForUser, ApiError>,
        'data' | 'isError' | 'isFetching'
    >,
) =>
    flag.isError ||
    flag.isFetching ||
    flag.data === undefined ||
    (flag.data.enabled &&
        (access.isFetching ||
            access.isError ||
            access.data === undefined ||
            access.data.refusal !== null));

const useCommittedLease = (dependencies: readonly unknown[]) => {
    const [scope, setScope] = useState({ dependencies, generation: 0 });
    const changed = dependencies.some(
        (value, index) => !Object.is(value, scope.dependencies[index]),
    );
    const generation = changed ? scope.generation + 1 : scope.generation;
    if (changed) setScope({ dependencies, generation });
    const lease = useMemo(() => ({ active: false, generation }), [generation]);
    useLayoutEffect(() => {
        lease.active = true;
        return () => {
            lease.active = false;
        };
    }, [lease]);
    return { lease, generation };
};

export const useOptionalAiAccessGate = (
    project: string | undefined,
    {
        enabled,
        ambientAvailable,
        connection = null,
    }: {
        enabled: boolean;
        ambientAvailable: boolean;
        connection?: string | null;
    },
) => {
    const api = useLightdashApi();
    const app = useApp();
    const { user } = app;
    const embed = useEmbed();
    const instance = useId();
    const { showToastApiError } = useToaster();
    const t = useUiStrings();
    const eligible =
        enabled &&
        !!project &&
        !isEmbeddedSurface(embed) &&
        isRegisteredUserReady(app);
    const { lease, generation } = useCommittedLease([
        api,
        user.data?.userUuid,
        user.data?.organizationUuid,
        project,
        connection,
        eligible,
        ambientAvailable,
    ]);
    const key = [
        instance,
        generation,
        user.data?.organizationUuid ?? null,
        user.data?.userUuid ?? null,
        project ?? null,
        connection,
    ];
    const assertCurrent = () => {
        if (!eligible || !lease.active) throw new CancelledError();
    };
    const readFlag = async (flag: string) => {
        assertCurrent();
        const result = await api<FeatureFlag>({
            version: 'v2',
            url: `/feature-flag/${flag}`,
            method: 'GET',
            body: undefined,
        });
        assertCurrent();
        return result;
    };
    const copilot = useQuery<FeatureFlag, ApiError>({
        queryKey: ['feature-flag', 'optional-ai-access', ...key, 'copilot'],
        queryFn: () => readFlag(CommercialFeatureFlags.AiCopilot),
        enabled: eligible && !ambientAvailable,
        retry: false,
    });
    const available = eligible && (ambientAvailable || isFlagEnabled(copilot));
    const identity = useQuery<FeatureFlag, ApiError>({
        queryKey: [
            'feature-flag',
            'optional-ai-access',
            ...key,
            'identity-flag',
        ],
        queryFn: () => readFlag(FeatureFlags.AgentIdentity),
        enabled: available,
        retry: false,
    });
    const discover = available && isFlagEnabled(identity);
    const { lease: requestLease, generation: requestGeneration } =
        useCommittedLease([lease, discover]);
    const canRequest = () =>
        eligible && lease.active && discover && requestLease.active;
    const query = useQuery<AiAccessForUser, ApiError>({
        queryKey: [
            'ai-access',
            'optional-ai-access',
            ...key,
            'me',
            requestGeneration,
        ],
        queryFn: async () => {
            if (!canRequest()) throw new CancelledError();
            try {
                const result = await aiAccessApi.me(api, project!, connection);
                if (!canRequest()) throw new CancelledError();
                return result;
            } catch (error) {
                if (!canRequest()) throw new CancelledError();
                throw error;
            }
        },
        enabled: discover,
        retry: false,
        onError: ({ error }) => {
            if (canRequest()) {
                showToastApiError({
                    title: t('aiAccess.loadError'),
                    apiError: error,
                });
            }
        },
    });
    return {
        disabled: !available || isDiscoveryBlocked(identity, query),
        refusal: discover ? (query.data?.refusal ?? null) : null,
        refetch: async () => {
            if (!canRequest()) return { status: 'not-applicable' as const };
            const result = await query.refetch();
            return canRequest()
                ? result
                : { status: 'not-applicable' as const };
        },
    };
};
