import { type CreateEmbedJwt, type UUID } from '@lightdash/common';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
    type EmbedExploreChart,
    type EmbedExploreOptions,
} from '../../providers/Embed/types';
import {
    EMBED_BACK_URL_PARAM,
    getEmbedBackUrl,
    getEmbedExploreSearch,
} from './embedNavigation';

type EmbedExploreLocationState = {
    embedBackUrl?: string;
};

// Explore and back navigation for embeds routed under /embed/:projectUuid
export const useEmbedRouteNavigation = (projectUuid: string | undefined) => {
    const [savedChart, setSavedChart] = useState<EmbedExploreChart>();
    const [customSqlProvenanceChartUuid, setCustomSqlProvenanceChartUuid] =
        useState<UUID>();
    const navigate = useNavigate();
    const location = useLocation();

    // Set when exploring from an Explore, e.g. a drill-down, so Back still
    // returns to the content the viewer started from.
    const getCurrentBackUrl = () => {
        const state = location.state as EmbedExploreLocationState | null;
        return (
            state?.embedBackUrl ??
            new URLSearchParams(location.search).get(EMBED_BACK_URL_PARAM)
        );
    };

    const handleExplore = (options: EmbedExploreOptions) => {
        setSavedChart(options.chart);
        setCustomSqlProvenanceChartUuid(
            options.customSqlProvenanceChartUuid ??
                ('uuid' in options.chart ? options.chart.uuid : undefined),
        );
        const backUrl =
            getCurrentBackUrl() ?? `${location.pathname}${location.search}`;
        void navigate(
            {
                pathname: `/embed/${projectUuid}/explore/${options.chart.tableName}`,
                search: getEmbedExploreSearch('', backUrl),
            },
            {
                state: {
                    embedBackUrl: backUrl,
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
        await navigate(
            getEmbedBackUrl({
                projectUuid,
                content,
                backUrl: getCurrentBackUrl(),
            }),
        );
    };

    return {
        savedChart,
        customSqlProvenanceChartUuid,
        handleExplore,
        handleBackToDashboard,
    };
};
