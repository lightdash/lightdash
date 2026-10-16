import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import EmbedChart from '../features/embed/EmbedChart/components/EmbedChart';
import useEmbed from '../providers/Embed/useEmbed';

const EmbedChartPage: FC<{
    containerStyles?: React.CSSProperties;
}> = ({ containerStyles }) => {
    const { t } = useTranslation('embed');
    const { chartUuid: chartUuidFromParams } = useParams<{
        chartUuid?: string;
    }>();
    const { embedToken, savedQueryUuid } = useEmbed();

    // Prioritize savedQueryUuid from embed context over URL params to avoid edge cases
    // where SDK customers might have chartUuid in their app that doesn't point to a Lightdash chart
    const chartUuid = savedQueryUuid ?? chartUuidFromParams;

    if (!embedToken) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    icon={IconUnlink}
                    title={t('page.invalidLink')}
                />
            </div>
        );
    }

    if (!chartUuid) {
        return (
            <div style={{ marginTop: '20px' }}>
                <SuboptimalState
                    title={t('page.missingChartId')}
                    icon={IconUnlink}
                />
            </div>
        );
    }

    return (
        <EmbedChart
            containerStyles={containerStyles}
            savedQueryUuid={chartUuid}
        />
    );
};

export default EmbedChartPage;
