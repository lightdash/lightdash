import { type CreateEmbedJwt, type UUID } from '@lightdash/common';
import { useEffect, useState, type FC } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import EmbedProvider from '../../providers/Embed/EmbedProvider';
import {
    type EmbedExploreChart,
    type EmbedExploreOptions,
} from '../../providers/Embed/types';
import useEmbed from '../../providers/Embed/useEmbed';
import {
    EMBED_BACK_URL_PARAM,
    getEmbedBackUrl,
    getEmbedExploreSearch,
} from './embedNavigation';

type EmbedExploreLocationState = {
    embedBackUrl?: string;
};

/**
 * Applies the embed's custom background color if provided.
 *
 * The color scheme itself is forced at the app root (see App.tsx) from the
 * ?theme= URL param, so the embed never writes to the viewer's shared
 * (cross-tab) theme preference.
 */
const EmbedBackgroundColorSync: FC<React.PropsWithChildren> = ({
    children,
}) => {
    const { backgroundColor } = useEmbed();

    useEffect(() => {
        if (backgroundColor) {
            const alphaHex =
                backgroundColor.length === 5
                    ? backgroundColor.slice(-1).repeat(2)
                    : backgroundColor.length === 9
                      ? backgroundColor.slice(-2)
                      : 'ff';
            document.documentElement.style.backgroundColor = backgroundColor;
            document.body.style.backgroundColor = backgroundColor;
            // Alpha colors show the page behind the header without another tint.
            document.documentElement.style.setProperty(
                '--ld-embed-header-background-color',
                alphaHex.toLowerCase() === 'ff'
                    ? backgroundColor
                    : 'transparent',
            );
            // Let tabs and actions show the header background beneath them.
            document.documentElement.style.setProperty(
                '--ld-embed-header-surface-color',
                'transparent',
            );
        }
        return () => {
            document.documentElement.style.backgroundColor = '';
            document.body.style.backgroundColor = '';
            document.documentElement.style.removeProperty(
                '--ld-embed-header-background-color',
            );
            document.documentElement.style.removeProperty(
                '--ld-embed-header-surface-color',
            );
        };
    }, [backgroundColor]);

    return <>{children}</>;
};

/**
 * A wrapping app around the Embed Context Provider. This allows better management of
 * the embedded iframe experience.
 */
const EmbeddedApp: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [savedChart, setSavedChart] = useState<EmbedExploreChart>();
    const [customSqlProvenanceChartUuid, setCustomSqlProvenanceChartUuid] =
        useState<UUID>();
    const navigate = useNavigate();
    const location = useLocation();

    const handleExplore = (options: EmbedExploreOptions) => {
        setSavedChart(options.chart);
        setCustomSqlProvenanceChartUuid(
            options.customSqlProvenanceChartUuid ??
                ('uuid' in options.chart ? options.chart.uuid : undefined),
        );
        void navigate(
            {
                pathname: `/embed/${projectUuid}/explore/${options.chart.tableName}`,
                search: getEmbedExploreSearch(
                    '',
                    `${location.pathname}${location.search}`,
                ),
            },
            {
                state: {
                    embedBackUrl: `${location.pathname}${location.search}`,
                } satisfies EmbedExploreLocationState,
            },
        );
    };

    const handleBackToDashboard = async (
        content: CreateEmbedJwt['content'] | undefined,
    ) => {
        if (!projectUuid) {
            return;
        }
        const state = location.state as EmbedExploreLocationState | null;
        await navigate(
            getEmbedBackUrl({
                projectUuid,
                content,
                backUrl:
                    state?.embedBackUrl ??
                    new URLSearchParams(location.search).get(
                        EMBED_BACK_URL_PARAM,
                    ),
            }),
        );
    };

    return (
        <EmbedProvider
            savedChart={savedChart}
            customSqlProvenanceChartUuid={customSqlProvenanceChartUuid}
            projectUuid={projectUuid}
            onExplore={handleExplore}
            onBackToDashboard={handleBackToDashboard}
        >
            <EmbedBackgroundColorSync>
                <Outlet />
            </EmbedBackgroundColorSync>
        </EmbedProvider>
    );
};

export default EmbeddedApp;
