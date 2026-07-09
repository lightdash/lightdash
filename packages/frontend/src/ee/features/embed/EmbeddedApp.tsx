import { type CreateEmbedJwt, type SavedChart } from '@lightdash/common';
import { useEffect, useState, type FC } from 'react';
import { Outlet, useLocation, useNavigate, useParams } from 'react-router';
import { getFromInMemoryStorage } from '../../../utils/inMemoryStorage';
import EmbedProvider from '../../providers/Embed/EmbedProvider';
import { EMBED_KEY, type InMemoryEmbed } from '../../providers/Embed/types';
import useEmbed from '../../providers/Embed/useEmbed';

type EmbedExploreLocationState = {
    embedBackUrl?: string;
};

const decodeEmbedJwtContent = (
    token: string | undefined,
): CreateEmbedJwt['content'] | undefined => {
    const payload = token?.split('.')[1];
    if (!payload) return undefined;

    try {
        const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
        const paddedPayload = normalizedPayload.padEnd(
            Math.ceil(normalizedPayload.length / 4) * 4,
            '=',
        );
        return (JSON.parse(window.atob(paddedPayload)) as CreateEmbedJwt)
            .content;
    } catch {
        return undefined;
    }
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
            document.documentElement.style.backgroundColor = backgroundColor;
            document.body.style.backgroundColor = backgroundColor;
        }
        return () => {
            document.documentElement.style.backgroundColor = '';
            document.body.style.backgroundColor = '';
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
    const [savedChart, setSavedChart] = useState<SavedChart>();
    const navigate = useNavigate();
    const location = useLocation();

    const handleExplore = (options: { chart: SavedChart }) => {
        setSavedChart(options.chart);
        void navigate(
            `/embed/${projectUuid}/explore/${options.chart.tableName}`,
        );
    };

    const handleBackToDashboard = async () => {
        const state = location.state as EmbedExploreLocationState | null;
        if (state?.embedBackUrl) {
            await navigate(state.embedBackUrl);
            return;
        }

        const embed = getFromInMemoryStorage<InMemoryEmbed>(EMBED_KEY);
        const content = decodeEmbedJwtContent(embed?.token);
        if (content?.type === 'aiAgent') {
            await navigate(
                `/embed/${projectUuid}/ai-agents/${content.agentUuid}/threads`,
            );
            return;
        }

        await navigate(`/embed/${projectUuid}`);
    };

    return (
        <EmbedProvider
            savedChart={savedChart}
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
