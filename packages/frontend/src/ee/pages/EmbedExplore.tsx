import { type SavedChart } from '@lightdash/common';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import EmbedExplore from '../features/embed/EmbedExplore/components/EmbedExplore';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedExplorePage: FC<{
    containerStyles?: React.CSSProperties;
    exploreId?: string;
    savedChart?: SavedChart;
}> = ({ containerStyles, exploreId, savedChart }) => {
    const { embedToken } = useEmbed();

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

    if (!exploreId) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title="Missing explore ID"
                    description="No explore ID provided"
                />
            </div>
        );
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

    return (
        <EmbedExplore
            containerStyles={containerStyles}
            exploreId={exploreId}
            savedChart={savedChart}
        />
    );
};

export default EmbedExplorePage;
