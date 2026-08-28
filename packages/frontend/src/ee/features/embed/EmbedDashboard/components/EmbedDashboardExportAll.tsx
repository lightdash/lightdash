import {
    SchedulerFormat,
    type Dashboard,
    type InteractivityOptions,
    type SchedulerCsvOptions,
} from '@lightdash/common';
import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { IconCsv, IconFileTypeXls, IconTableExport } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useExportDashboardContent } from '../../../../../hooks/dashboard/useDashboard';
import useDashboardContext from '../../../../../providers/Dashboard/useDashboardContext';
import { type EventData } from '../../../../../providers/Tracking/types';
import useTracking from '../../../../../providers/Tracking/useTracking';
import { useUiStrings } from '../../../../providers/Embed/useUiStrings';
import { embedContractClass } from '../../styles/embedClassContract';

type Props = {
    dashboard: Dashboard & InteractivityOptions;
    projectUuid: string;
};

// Bundles every chart tile into a single CSV/XLSX ZIP. Uses the same defaults as
// the non-embedded export modal (formatted values, table row limit) so embed
// viewers get a one-click "download everything" without extra configuration.
const EmbedDashboardExportAll: FC<Props> = ({ dashboard, projectUuid }) => {
    const getUiString = useUiStrings();
    const { track } = useTracking();
    const exportDashboardContentMutation = useExportDashboardContent();
    const dashboardFilters = useDashboardContext((c) => c.allFilters);
    const dateZoomGranularity = useDashboardContext(
        (c) => c.dateZoomGranularity,
    );
    const parameterValues = useDashboardContext((c) => c.parameterValues);

    if (!dashboard.canExportDashboardCsv) {
        return null;
    }

    const handleExport = (
        format: SchedulerFormat.CSV | SchedulerFormat.XLSX,
    ) => {
        const options: SchedulerCsvOptions = {
            formatted: true,
            limit: 'table',
            asAttachment: false,
            exportPivotedData: true,
            xlsxFileLayout: format === SchedulerFormat.XLSX ? 'zip' : undefined,
        };

        const event = {
            name: 'embedding_export_all.clicked',
            properties: {
                projectUuid,
                dashboardUuid: dashboard.uuid,
                format,
            },
        };
        track(event as EventData);

        exportDashboardContentMutation.mutate({
            dashboard,
            format,
            options,
            dashboardFilters,
            dateZoomGranularity,
            parameters: parameterValues,
            selectedTabs: null,
        });
    };

    return (
        <Menu position="bottom-end" withinPortal>
            <Menu.Target>
                <Tooltip
                    label={getUiString('dashboard.exportAllTiles')}
                    withinPortal
                    position="bottom"
                >
                    <ActionIcon
                        className={embedContractClass(
                            'ld-dashboard-export-all',
                        )}
                        variant="default"
                        size="lg"
                        radius="md"
                        loading={exportDashboardContentMutation.isLoading}
                    >
                        <MantineIcon icon={IconTableExport} />
                    </ActionIcon>
                </Tooltip>
            </Menu.Target>
            <Menu.Dropdown>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconCsv} />}
                    onClick={() => handleExport(SchedulerFormat.CSV)}
                >
                    Export all as .csv (.zip)
                </Menu.Item>
                <Menu.Item
                    leftSection={<MantineIcon icon={IconFileTypeXls} />}
                    onClick={() => handleExport(SchedulerFormat.XLSX)}
                >
                    Export all as .xlsx (.zip)
                </Menu.Item>
            </Menu.Dropdown>
        </Menu>
    );
};

export default EmbedDashboardExportAll;
