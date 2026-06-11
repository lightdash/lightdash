import {
    isChartContent,
    type CreateEmbedJwt,
    type SavedChart,
} from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams, useSearchParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import EmbedExplore from '../features/embed/EmbedExplore/components/EmbedExplore';
import useEmbed from '../providers/Embed/useEmbed';

const decodeEmbedJwtContent = (
    token: string | undefined,
): CreateEmbedJwt['content'] | undefined => {
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
        const decoded = JSON.parse(window.atob(paddedPayload)) as Pick<
            CreateEmbedJwt,
            'content'
        >;
        return decoded.content;
    } catch {
        return undefined;
    }
};

const EmbedExplorePage: FC<{
    containerStyles?: React.CSSProperties;
    exploreId?: string;
    savedChart?: SavedChart;
}> = ({
    containerStyles,
    exploreId: exploreIdProps,
    savedChart: savedChartProps,
}) => {
    const {
        content,
        embedToken,
        projectUuid: embedProjectUuid,
        savedChart: savedChartEmbed,
    } = useEmbed();
    const { projectUuid: paramsProjectUuid } = useParams<{
        projectUuid: string;
    }>();
    const [searchParams] = useSearchParams();
    const projectUuid = embedProjectUuid ?? paramsProjectUuid;
    const jwtContent = content ?? decodeEmbedJwtContent(embedToken);
    const chartUuidFromJwt =
        jwtContent && isChartContent(jwtContent)
            ? jwtContent.contentId
            : undefined;
    const chartUuid = searchParams.get('chartUuid') ?? chartUuidFromJwt;
    const chartQuery = useSavedQuery({
        uuidOrSlug: chartUuid,
        projectUuid,
        useQueryOptions: {
            enabled:
                !!embedToken &&
                savedChartEmbed === undefined &&
                savedChartProps === undefined &&
                chartUuid !== undefined,
        },
    });
    const savedChart = savedChartEmbed || savedChartProps || chartQuery.data;

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title="This embed link is not valid"
                />
            </div>
        );
    }

    if (!savedChart && chartQuery.isInitialLoading) {
        return null;
    }

    if (!savedChart) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Missing saved chart to explore"
                    icon={IconUnlink}
                />
            </div>
        );
    }

    const exploreId = exploreIdProps || savedChart?.tableName;

    return (
        <EmbedExplore
            containerStyles={containerStyles}
            exploreId={exploreId}
            savedChart={savedChart}
        />
    );
};

export default EmbedExplorePage;
