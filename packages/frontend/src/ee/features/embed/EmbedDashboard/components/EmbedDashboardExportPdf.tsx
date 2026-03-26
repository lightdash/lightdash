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

/**
 * Collect every ancestor element between `el` and `<body>` (exclusive).
 * Used to temporarily expand fixed-height parents so the full dashboard
 * content is visible during printing.
 */
function getAncestors(el: HTMLElement): HTMLElement[] {
    const ancestors: HTMLElement[] = [];
    let current = el.parentElement;
    while (current && current !== document.body) {
        ancestors.push(current);
        current = current.parentElement;
    }
    return ancestors;
}

type SavedStyle = {
    el: HTMLElement;
    height: string;
    overflow: string;
    maxHeight: string;
    position: string;
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
                data-hide-print="true"
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

                    // Save and clear theme inline background colors so the
                    // @media print rules in print.css can force a white
                    // background (inline styles have higher specificity than
                    // !important in stylesheets in some browser print paths).
                    const savedHtmlBg =
                        document.documentElement.style.backgroundColor;
                    const savedBodyBg = document.body.style.backgroundColor;
                    document.documentElement.style.backgroundColor = '';
                    document.body.style.backgroundColor = '';

                    // In SDK mode the embed container sits inside the host
                    // page's DOM which may constrain height/overflow.  Expand
                    // every ancestor so the full dashboard content is visible.
                    const savedAncestorStyles: SavedStyle[] = [];

                    if (printContainer) {
                        originalStyles.height = printContainer.style.height;
                        originalStyles.overflowY =
                            printContainer.style.overflowY;
                        originalStyles.overflow = printContainer.style.overflow;

                        // Expand container for multi-page printing
                        printContainer.style.height = 'auto';
                        printContainer.style.overflowY = 'visible';
                        printContainer.style.overflow = 'visible';

                        // Expand ancestors
                        for (const ancestor of getAncestors(printContainer)) {
                            savedAncestorStyles.push({
                                el: ancestor,
                                height: ancestor.style.height,
                                overflow: ancestor.style.overflow,
                                maxHeight: ancestor.style.maxHeight,
                                position: ancestor.style.position,
                            });
                            ancestor.style.height = 'auto';
                            ancestor.style.overflow = 'visible';
                            ancestor.style.maxHeight = 'none';
                        }

                        const contentWidth = printContainer.scrollWidth;
                        // 10mm margin on each side ≈ 76px at 96 dpi
                        const PAGE_MARGIN_PX = 76;
                        pageStyle = document.createElement('style');
                        pageStyle.textContent = `@media print { @page { size: ${contentWidth + PAGE_MARGIN_PX}px 11in; margin: 10mm; } }`;
                        document.head.appendChild(pageStyle);
                    }

                    window.print();

                    // Restore theme inline background colors
                    document.documentElement.style.backgroundColor =
                        savedHtmlBg;
                    document.body.style.backgroundColor = savedBodyBg;

                    // Restore ancestor styles
                    for (const saved of savedAncestorStyles) {
                        saved.el.style.height = saved.height;
                        saved.el.style.overflow = saved.overflow;
                        saved.el.style.maxHeight = saved.maxHeight;
                    }

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
