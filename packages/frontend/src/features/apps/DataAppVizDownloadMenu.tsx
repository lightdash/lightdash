import { ActionIcon, Button, Popover } from '@mantine/core';
import { IconShare2 } from '@tabler/icons-react';
import {
    COLLAPSABLE_CARD_ACTION_ICON_PROPS,
    COLLAPSABLE_CARD_POPOVER_PROPS,
} from '../../components/common/CollapsableCard/constants';
import MantineIcon from '../../components/common/MantineIcon';
import { useDateZoomGranularitySearch } from '../../hooks/useExplorerRoute';
import { useSavedChartImageExport } from '../../hooks/useSavedChartImageExport';
import {
    selectHasUnsavedChanges,
    selectSavedChart,
    useExplorerSelector,
} from '../explorer/store';
import { useChartVersionPreview } from './ChartVersionPreview/useChartVersionPreview';

/** Export a custom chart only when Explorer displays its saved state. */
const DataAppVizDownloadMenu = ({ projectUuid }: { projectUuid: string }) => {
    const savedChart = useExplorerSelector(selectSavedChart);
    const hasUnsavedChanges = useExplorerSelector(selectHasUnsavedChanges);
    const dateZoom = useDateZoomGranularitySearch();
    const chartVersionPreview = useChartVersionPreview();
    const { mutate: exportImage, isLoading } = useSavedChartImageExport();

    if (
        !savedChart ||
        savedChart.hasUnpublishedChanges ||
        hasUnsavedChanges ||
        dateZoom ||
        chartVersionPreview !== undefined
    ) {
        return null;
    }

    return (
        <Popover {...COLLAPSABLE_CARD_POPOVER_PROPS} position="bottom-end">
            <Popover.Target>
                <ActionIcon
                    data-testid="export-csv-button"
                    {...COLLAPSABLE_CARD_ACTION_ICON_PROPS}
                >
                    <MantineIcon icon={IconShare2} />
                </ActionIcon>
            </Popover.Target>
            <Popover.Dropdown>
                <Button
                    size="xs"
                    loading={isLoading}
                    onClick={() =>
                        exportImage({
                            chartUuid: savedChart.uuid,
                            projectUuid,
                            chartName: savedChart.name,
                        })
                    }
                >
                    Export PNG
                </Button>
            </Popover.Dropdown>
        </Popover>
    );
};

export default DataAppVizDownloadMenu;
