import { useCallback, type FC } from 'react';
import ExportDataModal from '../../../../../components/DashboardTiles/ExportDataModal';
import { type Limit } from '../../../../../components/ExportResults/types';
import { getAiSqlArtifactDownloadQueryUuid } from '../../utils/getAiSqlArtifactDownloadQueryUuid';

type Props = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    queryUuid: string;
    sql: string;
    chartName: string;
    totalResults: number;
    columnOrder: string[];
};

export const AiSqlArtifactDownloadModal: FC<Props> = ({
    opened,
    onClose,
    projectUuid,
    queryUuid,
    sql,
    chartName,
    totalResults,
    columnOrder,
}) => {
    const getDownloadQueryUuid = useCallback(
        (limit: number | null, limitType: Limit) =>
            getAiSqlArtifactDownloadQueryUuid({
                projectUuid,
                queryUuid,
                sql,
                limit,
                limitType,
            }),
        [projectUuid, queryUuid, sql],
    );

    return (
        <ExportDataModal
            isOpen={opened}
            onClose={onClose}
            projectUuid={projectUuid}
            totalResults={totalResults}
            getDownloadQueryUuid={getDownloadQueryUuid}
            columnOrder={columnOrder}
            chartName={chartName}
        />
    );
};
