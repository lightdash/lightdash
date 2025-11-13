import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import EmbedChart from '../features/embed/EmbedChart/components/EmbedChart';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedChartPage: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
    const { embedToken, savedQueryUuid } = useEmbed();

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

    if (!savedQueryUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState title="Missing chart ID" icon={IconUnlink} />
            </div>
        );
    }

    return (
        <EmbedChart
            containerStyles={containerStyles}
            savedQueryUuid={savedQueryUuid}
        />
    );
};

export default EmbedChartPage;
