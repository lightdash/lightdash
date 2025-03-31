import { type Dashboard, type InteractivityOptions } from '@lightdash/common';
import { ActionIcon, Tooltip } from '@mantine/core';
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

                    if (printContainer) {
                        printContainer.style.height = 'auto';
                        printContainer.style.overflowY = 'visible';
                    }

                    window.print();

                    if (printContainer) {
                        printContainer.style.height = '100vh';
                        printContainer.style.overflowY = 'auto';
                    }
                }}
                size="lg"
                sx={{
                    ...(inHeader
                        ? {}
                        : {
                              position: 'absolute',
                              top: 20,
                              right: 72, // Make sure the button does not overlap the chart options
                          }),
                    zIndex: 1000,
                }}
            >
                <MantineIcon size="xl" icon={IconPrinter} />
            </ActionIcon>
        </Tooltip>
    );
};

export default EmbedDashboardExportPdf;
