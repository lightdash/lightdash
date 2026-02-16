import { type Dashboard, type InteractivityOptions } from '@lightdash/common';
import { ActionIcon, getDefaultZIndex, Tooltip } from '@mantine/core';
import { IconPrinter } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { type EventData } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';

import '../styles/print.css';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    inHeader: boolean;
    projectUuid: string;
};

const EmbedDashboardExportPdf: FC<Props> = ({
    projectUuid,
    dashboard,
    inHeader,
}) => {
    const { track } = useTracking();

    if (!dashboard.canExportPagePdf) {
        return null;
    }
    return (
        <Tooltip label="Print this page" withinPortal position="bottom">
            <ActionIcon
                variant="default"
                onClick={() => {
                    const event = {
                        name: 'embedding_print.clicked',
                        properties: {
                            projectUuid: projectUuid,
                            dashboardUuid: dashboard.uuid,
                        },
                    };
                    track(event as EventData);
                    const printContainer = document.getElementById(
                        'embed-scroll-container',
                    );

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
                        originalStyles.overflowY =
                            printContainer.style.overflowY;
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
                        printContainer.style.overflowY =
                            originalStyles.overflowY;
                        printContainer.style.overflow = originalStyles.overflow;
                    }
                    pageStyle?.remove();
                }}
                size="lg"
                radius="md"
                sx={{
                    ...(inHeader
                        ? {}
                        : {
                              position: 'absolute',
                              top: 20,
                              right: 72, // Make sure the button does not overlap the chart options
                          }),
                    zIndex: getDefaultZIndex('modal') - 1,
                }}
            >
                <MantineIcon icon={IconPrinter} />
            </ActionIcon>
        </Tooltip>
    );
};

export default EmbedDashboardExportPdf;
