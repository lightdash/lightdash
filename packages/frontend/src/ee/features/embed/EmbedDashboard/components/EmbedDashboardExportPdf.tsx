import {
    SchedulerFormat,
    type Dashboard,
    type InteractivityOptions,
} from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
import { IconFileTypePdf, IconPrinter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import {
    selectDateZoomGranularity,
    selectParameterValues,
    useDashboardAllFilters,
    useDashboardSelector,
} from '../../../../../features/dashboard/store';
import { useExportDashboardContent } from '../../../../../hooks/dashboard/useDashboard';
import { type EventData } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import useEmbed from '../../../../providers/Embed/useEmbed';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import '../styles/print.css';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
};

const printDashboard = () => {
    const printContainer = document.getElementById('embed-scroll-container');

    const originalStyles = {
        height: '',
        overflowY: '',
        overflow: '',
    };

    // Dynamically set the print page width to match the
    // dashboard content. react-grid-layout computes tile
    // positions based on the viewport width, so we size the
    // page to match rather than scaling the content down.
    let pageStyle: HTMLStyleElement | null = null;

    if (printContainer) {
        originalStyles.height = printContainer.style.height;
        originalStyles.overflowY = printContainer.style.overflowY;
        originalStyles.overflow = printContainer.style.overflow;

        // Expand container for multi-page printing
        printContainer.style.height = 'auto';
        printContainer.style.overflowY = 'visible';
        printContainer.style.overflow = 'visible';

        const contentWidth = printContainer.scrollWidth;
        // 10mm margin on each side ≈ 76px at 96 dpi
        const PAGE_MARGIN_PX = 76;
        pageStyle = document.createElement('style');
        pageStyle.textContent = `@media print { @page { size: ${contentWidth + PAGE_MARGIN_PX}px 11in; margin: 10mm; } }`;
        document.head.appendChild(pageStyle);
    }

    window.print();

    if (printContainer) {
        printContainer.style.height = originalStyles.height;
        printContainer.style.overflowY = originalStyles.overflowY;
        printContainer.style.overflow = originalStyles.overflow;
    }
    pageStyle?.remove();
};

// Iframe embeds print their own document. SDK embeds share the host page, so
// printing would capture host UI; they render the PDF on the server instead.
const EmbedDashboardExportPdf: FC<Props> = ({ projectUuid, dashboard }) => {
    const { track } = useTracking();
    const getUiString = useUiStrings();
    const { mode } = useEmbed();
    const exportDashboardContentMutation = useExportDashboardContent();
    const allFilters = useDashboardAllFilters();
    const dateZoomGranularity = useDashboardSelector(selectDateZoomGranularity);
    const parameterValues = useDashboardSelector(selectParameterValues);

    if (!dashboard.canExportPagePdf) {
        return null;
    }

    const isServerExport = mode === 'sdk';

    return (
        <Tooltip
            label={getUiString(
                isServerExport ? 'dashboard.exportPdf' : 'dashboard.printPage',
            )}
            position="bottom"
        >
            <ActionIcon
                variant="default"
                loading={exportDashboardContentMutation.isLoading}
                onClick={() => {
                    const event = {
                        name: 'embedding_print.clicked',
                        properties: {
                            projectUuid: projectUuid,
                            dashboardUuid: dashboard.uuid,
                        },
                    };
                    track(event as EventData);
                    if (!isServerExport) {
                        printDashboard();
                        return;
                    }
                    exportDashboardContentMutation.mutate({
                        dashboard,
                        format: SchedulerFormat.PDF,
                        options: {},
                        dashboardFilters: allFilters,
                        dateZoomGranularity,
                        parameters: parameterValues,
                        selectedTabs: null,
                    });
                }}
                size="lg"
            >
                <MantineIcon
                    icon={isServerExport ? IconFileTypePdf : IconPrinter}
                />
            </ActionIcon>
        </Tooltip>
    );
};

export default EmbedDashboardExportPdf;
