import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import EmbedExplore from '../features/embed/EmbedExplore/components/EmbedExplore';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedExplorePage: FC<{
    containerStyles?: React.CSSProperties;
    exploreId?: string;
    explore?: any;
}> = ({ containerStyles, exploreId: propExploreId, explore }) => {
    const { exploreId: urlExploreId } = useParams<{
        projectUuid?: string;
        exploreId?: string;
    }>();

    const { embedToken } = useEmbed();

    const exploreId = propExploreId ?? urlExploreId;

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

    return (
        <EmbedExplore
            containerStyles={containerStyles}
            exploreId={exploreId}
            explore={explore}
        />
    );
};

export default EmbedExplorePage;
