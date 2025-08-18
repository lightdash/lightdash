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
}> = ({
    containerStyles,
    exploreId: exploreIdProps,
    savedChart: savedChartProps,
}) => {
    const { embedToken, savedChart: savedChartEmbed } = useEmbed();
    const savedChart = savedChartEmbed || savedChartProps;

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
