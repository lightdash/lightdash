import { Box } from '@mantine/core';
import { IconUnlink } from '@tabler/icons-react';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import LoadingChart from '../../../../../components/common/LoadingChart';
import SuboptimalState from '../../../../../components/common/SuboptimalState/SuboptimalState';
import { useProjectUuid } from '../../../../../hooks/useProjectUuid';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';
import MinimalSavedExplorer from '../../../../../pages/MinimalSavedExplorer';

type Props = {
    containerStyles?: React.CSSProperties;
    savedQueryUuid: string;
};

const EmbedChart: FC<Props> = ({ containerStyles, savedQueryUuid }) => {
    const { t } = useTranslation('embed');
    const projectUuid = useProjectUuid();
    const { data, isInitialLoading, isError, error } = useSavedQuery({
        uuidOrSlug: savedQueryUuid,
        projectUuid,
    });

    const containerStyle: React.CSSProperties = containerStyles ?? {
        height: '100vh',
        overflowY: 'auto',
        margin: '16px',
    };

    if (isInitialLoading) {
        return (
            <div style={containerStyle}>
                <LoadingChart />
            </div>
        );
    }

    if (isError) {
        return (
            <Box mt={20}>
                <SuboptimalState
                    title={t('chart.loadError')}
                    icon={IconUnlink}
                    description={
                        error.error.message.includes('jwt expired')
                            ? t('expired')
                            : error.error.message
                    }
                />
            </Box>
        );
    }

    if (!data) {
        return (
            <Box mt={20}>
                <SuboptimalState
                    title={t('chart.notFound')}
                    icon={IconUnlink}
                />
            </Box>
        );
    }

    return (
        <div style={containerStyle}>
            <MinimalSavedExplorer savedQueryUuid={savedQueryUuid} />
        </div>
    );
};

export default EmbedChart;
