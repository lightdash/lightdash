import { type FC } from 'react';
import DashboardChartEditorModal from '../../../../../components/DashboardTiles/DashboardChartEditorModal';
import { useSavedQuery } from '../../../../../hooks/useSavedQuery';

type Props = {
    chartUuid: string | null;
    projectUuid: string | undefined;
    onClose: () => void;
};

const noop = () => {};

/**
 * Hosts the chart editor over the AI agent thread view, so a chart the agent
 * created or edited can be tweaked without leaving the conversation. Save
 * propagation is handled by the version mutation's cache invalidation.
 */
const AiThreadChartEditorModal: FC<Props> = ({
    chartUuid,
    projectUuid,
    onClose,
}) => {
    const { data: chart } = useSavedQuery({
        uuidOrSlug: chartUuid ?? undefined,
        projectUuid,
        useQueryOptions: { enabled: !!chartUuid && !!projectUuid },
    });

    if (!chartUuid || !chart || chart.uuid !== chartUuid) return null;

    return (
        <DashboardChartEditorModal
            opened
            dashboard={null}
            editChart={chart}
            customMetricsEnabled={false}
            onChartSaved={onClose}
            onRegistryMetricEdited={noop}
            onRegistryMetricDeleted={noop}
            onClose={onClose}
        />
    );
};

export default AiThreadChartEditorModal;
