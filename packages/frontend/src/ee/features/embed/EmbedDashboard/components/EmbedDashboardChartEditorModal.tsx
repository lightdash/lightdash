import { type SavedChart } from '@lightdash/common';
import { IconChartBar } from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import MantineModal from '../../../../../components/common/MantineModal';
import EmbedProviderContext from '../../../../providers/Embed/context';
import useEmbed from '../../../../providers/Embed/useEmbed';
import EmbedExplore from '../../EmbedExplore/components/EmbedExplore';
import { type ChartSavedAction } from '../../events/types';

type Props = {
    opened: boolean;
    onClose: () => void;
    onChartSaved: (chart: SavedChart) => void;
    // When set, the editor opens this chart and saving creates a new version
    // of it; when absent, it starts from the table picker and creates a chart.
    editChart?: SavedChart;
};

/**
 * Chart editor for the embedded dashboard builder: a full-screen modal hosting
 * an Explore. "New chart" starts on the table picker; "Edit chart" opens an
 * existing tile's chart. Saving goes through the regular embed write-actions
 * path and hands the chart back via `onChartSaved`.
 */
const EmbedDashboardChartEditorModal: FC<Props> = ({
    opened,
    onClose,
    onChartSaved,
    editChart,
}) => {
    const embedContext = useEmbed();
    const [pickedExploreId, setPickedExploreId] = useState<string>();
    const exploreId = editChart ? editChart.tableName : pickedExploreId;

    const handleClose = () => {
        setPickedExploreId(undefined);
        onClose();
    };
    const handleChartSaved = useCallback(
        (chart: SavedChart, action: ChartSavedAction) => {
            embedContext.onChartSaved?.(chart, action);
            onChartSaved(chart);
        },
        [embedContext, onChartSaved],
    );

    // The explorer renders over the dashboard, not instead of it: suppress the
    // header's "Back to Dashboard" button (closing the modal is the way back)
    // and capture the chart created/updated by the save flow.
    const overriddenContext = useMemo(
        () => ({
            ...embedContext,
            onBackToDashboard: undefined,
            savedChart: undefined,
            customSqlProvenanceChartUuid: editChart?.uuid,
            savedQueryUuid: undefined,
            onChartSaved: handleChartSaved,
        }),
        [editChart?.uuid, embedContext, handleChartSaved],
    );

    return (
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={editChart ? 'Edit chart' : 'New chart'}
            icon={IconChartBar}
            fullScreen
            cancelLabel={false}
            modalBodyProps={{ px: 0, py: 0 }}
        >
            <EmbedProviderContext.Provider value={overriddenContext}>
                <EmbedExplore
                    containerStyles={{ height: '100%', overflow: 'hidden' }}
                    exploreId={exploreId ?? ''}
                    savedChart={editChart}
                    allowChartUpdate={editChart !== undefined}
                    onExploreSelect={editChart ? undefined : setPickedExploreId}
                    onBackToTables={
                        editChart
                            ? undefined
                            : () => setPickedExploreId(undefined)
                    }
                    fitContainerHeight
                />
            </EmbedProviderContext.Provider>
        </MantineModal>
    );
};

export default EmbedDashboardChartEditorModal;
