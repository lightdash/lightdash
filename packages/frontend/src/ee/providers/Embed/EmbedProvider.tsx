import {
    type CreateEmbedJwt,
    type LanguageMap,
    type SavedChart,
    type SdkUiOverrides,
    type UiStringKey,
    type UUID,
} from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useAccount } from '../../../hooks/user/useAccount';
import { useAbilityContext } from '../../../providers/Ability/useAbilityContext';
import {
    getFromInMemoryStorage,
    setToInMemoryStorage,
} from '../../../utils/inMemoryStorage';
import { type SdkFilter } from '../../features/embed/EmbedDashboard/types';
import {
    LightdashEventType,
    type ChartSavedAction,
} from '../../features/embed/events/types';
import { useEmbedEventEmitter } from '../../features/embed/hooks/useEmbedEventEmitter';
import EmbedProviderContext from './context';
import { parseEmbedThemeParams } from './parseEmbedThemeParams';
import { parseEmbedTimezoneParam } from './parseEmbedTimezoneParam';
import {
    EMBED_KEY,
    type EmbedExploreChart,
    type EmbedExploreOptions,
    type EmbedMode,
    type InMemoryEmbed,
} from './types';

type Props = {
    embedToken?: string;
    filters?: SdkFilter[];
    projectUuid?: string;
    paletteUuid?: string;
    contentOverrides?: LanguageMap;
    uiOverrides?: SdkUiOverrides;
    embedHeaders?: Record<string, string>;
    onExplore?: (options: EmbedExploreOptions) => void;
    onBackToDashboard?: () => void;
    onChartSaved?: (chart: SavedChart, action: ChartSavedAction) => void;
    savedChart?: EmbedExploreChart;
    customSqlProvenanceChartUuid?: UUID;
    savedQueryUuid?: string;
    appUuid?: string;
};

const decodeEmbedJwtPayload = (
    token: string | undefined,
): Pick<CreateEmbedJwt, 'content' | 'writeActions'> | undefined => {
    const payload = token?.split('.')[1];
    if (!payload) {
        return undefined;
    }

    try {
        const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
        const paddedPayload = normalizedPayload.padEnd(
            Math.ceil(normalizedPayload.length / 4) * 4,
            '=',
        );
        return JSON.parse(window.atob(paddedPayload)) as Pick<
            CreateEmbedJwt,
            'content' | 'writeActions'
        >;
    } catch {
        return undefined;
    }
};

const EmbedProvider: FC<React.PropsWithChildren<Props>> = ({
    children,
    embedToken: encodedToken,
    filters,
    projectUuid: projectUuidFromProps,
    paletteUuid,
    contentOverrides,
    uiOverrides,
    onExplore,
    onBackToDashboard,
    onChartSaved,
    savedChart,
    customSqlProvenanceChartUuid,
    savedQueryUuid,
    appUuid,
}) => {
    const embedToken = encodedToken || window.location.hash.replace('#', '');
    const params = useParams();
    const projectUuid = projectUuidFromProps || params.projectUuid;

    // Synced during render, not in an effect: direct embeds strip the token hash
    // on first render, and the empty prop that follows must not wipe the store.
    const storedEmbed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
    if (
        embedToken &&
        (storedEmbed?.token !== embedToken ||
            storedEmbed?.projectUuid !== projectUuid)
    ) {
        setToInMemoryStorage(EMBED_KEY, {
            projectUuid,
            token: embedToken,
        });
    }

    // Parse theme params from URL once on mount (before hash is stripped)
    const [embedThemeParams] = useState(parseEmbedThemeParams);
    // Parse the session timezone (?timezone=) once on mount, alongside the theme.
    // Only the direct/iframe embed owns its URL; in SDK mode window.location is
    // the host app's URL, so we must not scrape ?timezone= from it.
    const [embedTimezone] = useState(() =>
        encodedToken ? null : parseEmbedTimezoneParam(),
    );
    const embed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
    const { data: account, isLoading } = useAccount();
    const ability = useAbilityContext();
    const navigate = useNavigate();
    const location = useLocation();
    const queryClient = useQueryClient();
    const { dispatchEmbedEvent } = useEmbedEventEmitter();
    const mode: EmbedMode = encodedToken ? 'sdk' : 'direct';
    const tokenFromStorageOrProps = embedToken || embed?.token;
    const embedWriteContext =
        account && 'embedWriteContext' in account
            ? account.embedWriteContext
            : undefined;
    const embedJwtPayload = useMemo(
        () => decodeEmbedJwtPayload(tokenFromStorageOrProps),
        [tokenFromStorageOrProps],
    );
    const effectiveContent = useMemo(() => {
        if (!embedJwtPayload?.content) {
            return undefined;
        }

        const embedPermissions =
            account && 'embedPermissions' in account
                ? account.embedPermissions
                : undefined;

        return {
            ...embedJwtPayload.content,
            ...embedPermissions,
        } as CreateEmbedJwt['content'];
    }, [account, embedJwtPayload?.content]);
    const handleChartSaved = useCallback(
        (chart: SavedChart, action: ChartSavedAction) => {
            onChartSaved?.(chart, action);

            if (mode === 'direct') {
                dispatchEmbedEvent(LightdashEventType.ChartSaved, {
                    chartUuid: chart.uuid,
                    action,
                });
            }
        },
        [dispatchEmbedEvent, mode, onChartSaved],
    );

    // Remove the token from the URL.
    useEffect(() => {
        if (mode === 'direct' && location.hash) {
            void navigate(location.pathname + location.search, {
                replace: true,
            });
        }
    }, [mode, location, navigate]);

    // We sync embed UI changes with the URL just as with the main app.
    // For iframe embeds only, we emit messages to the parent window.
    useEffect(() => {
        if (mode === 'sdk') return;

        dispatchEmbedEvent(LightdashEventType.LocationChanged, {
            pathname: location.pathname,
            search: location.search,
            href: window.location.href,
        });
    }, [location, dispatchEmbedEvent, mode]);

    // Set ability rules for the embedded user. We should only get abilities from abilityContext
    // rather than directly on the user or account.
    useEffect(() => {
        if (!isLoading && account?.user) {
            ability.update(account.user.abilityRules);
        }
    }, [ability, account, isLoading]);

    // A rotated token can carry different claims, and the account query is not
    // keyed on the token, so refetch it rather than serve stale abilities.
    const lastSeenTokenRef = useRef(embedToken);
    useEffect(() => {
        if (!embedToken || lastSeenTokenRef.current === embedToken) {
            return;
        }
        lastSeenTokenRef.current = embedToken;
        void queryClient.invalidateQueries({ queryKey: ['account'] });
    }, [embedToken, queryClient]);

    const value = useMemo(() => {
        return {
            embedToken: tokenFromStorageOrProps,
            filters,
            // Single resolution point for UI-string overrides; a future
            // direct-embed transport adds its source here.
            t: (input: UiStringKey) => uiOverrides?.[input],
            projectUuid: embed?.projectUuid || projectUuid,
            content: effectiveContent,
            writeActions: embedJwtPayload?.writeActions,
            embedWriteContext,
            paletteUuid,
            languageMap: contentOverrides,
            onExplore,
            onChartSaved: handleChartSaved,
            savedChart,
            customSqlProvenanceChartUuid,
            savedQueryUuid,
            appUuid,
            onBackToDashboard,
            mode,
            theme: embedThemeParams.theme,
            backgroundColor: embedThemeParams.backgroundColor,
            timezone: embedTimezone,
        };
    }, [
        embed?.projectUuid,
        tokenFromStorageOrProps,
        effectiveContent,
        embedJwtPayload?.writeActions,
        embedWriteContext,
        filters,
        projectUuid,
        paletteUuid,
        contentOverrides,
        uiOverrides,
        onExplore,
        handleChartSaved,
        savedChart,
        customSqlProvenanceChartUuid,
        savedQueryUuid,
        appUuid,
        onBackToDashboard,
        mode,
        embedThemeParams.theme,
        embedThemeParams.backgroundColor,
        embedTimezone,
    ]);

    return (
        <EmbedProviderContext.Provider value={value}>
            {children}
        </EmbedProviderContext.Provider>
    );
};

export default EmbedProvider;
