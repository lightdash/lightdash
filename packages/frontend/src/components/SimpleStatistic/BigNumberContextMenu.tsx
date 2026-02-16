import { type ResultValue } from '@lightdash/common';
import { Menu } from '@mantine-8/core';
import { Text } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useMemo, type FC } from 'react';
import { useOrganization } from '../../hooks/organization/useOrganization';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useAccount } from '../../hooks/user/useAccount';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { UnderlyingDataMenuItem } from '../DashboardTiles/UnderlyingDataMenuItem';
import { isBigNumberVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

type BigNumberContextMenuProps = {
    isMinimal?: boolean;
    canDrillInto: boolean;
    canViewUnderlyingData: boolean;
};

const BigNumberContextMenu: FC<
    React.PropsWithChildren<BigNumberContextMenuProps>
> = ({ children, isMinimal = false, canDrillInto, canViewUnderlyingData }) => {
    const clipboard = useClipboard({ timeout: 200 });
    const { showToastSuccess } = useToaster();
    const { resultsData, visualizationConfig, itemsMap } =
        useVisualizationContext();
    // Always fail silently - parent component controls when this menu is rendered
    const metricQueryData = useMetricQueryDataContext(true);

    const tracking = useTracking({ failSilently: true });
    const { data: account } = useAccount();
    const projectUuid = useProjectUuid();
    const { data: organization } = useOrganization();
    const userId = account?.user?.id;

    const isBigNumber = isBigNumberVisualizationConfig(visualizationConfig);

    const fieldValues: Record<string, ResultValue> = useMemo(() => {
        return mapValues(resultsData?.rows?.[0], (col) => col.value) ?? {};
    }, [resultsData]);

    const item = useMemo(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        return chartConfig.getField(chartConfig.selectedField);
    }, [visualizationConfig, isBigNumber]);

    const value = useMemo(() => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        if (chartConfig.selectedField) {
            return fieldValues[chartConfig.selectedField];
        }
    }, [fieldValues, visualizationConfig, isBigNumber]);

    // Early return if context is not available
    if (!metricQueryData) {
        return <>{children}</>;
    }

    const { openUnderlyingDataModal, openDrillDownModal, metricQuery } =
        metricQueryData;

    const handleCopyToClipboard = () => {
        if (!value) return;
        clipboard.copy(value.formatted);
        showToastSuccess({ title: 'Copied to clipboard!' });
    };

    const handleViewUnderlyingData = () => {
        if (!isBigNumber) return;

        const { chartConfig } = visualizationConfig;

        if (!itemsMap || chartConfig.selectedField === undefined || !value) {
            return;
        }

        openUnderlyingDataModal({ item, value, fieldValues });
    };

    const handleOpenDrillIntoModal = () => {
        if (!item) return;

        openDrillDownModal({ item, fieldValues });
        tracking?.track({
            name: EventName.DRILL_BY_CLICKED,
            properties: {
                organizationId: organization?.organizationUuid,
                userId,
                projectId: projectUuid,
            },
        });
    };

    if (!item && !value) return <>{children}</>;

    return (
        <Menu
            withArrow
            withinPortal
            shadow="md"
            position="bottom"
            closeOnItemClick
            closeOnEscape
            radius={0}
            offset={-2}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                {value && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconCopy} />}
                        onClick={handleCopyToClipboard}
                    >
                        Copy value
                    </Menu.Item>
                )}

                {item && metricQuery && canViewUnderlyingData && (
                    <UnderlyingDataMenuItem
                        metricQuery={metricQuery}
                        onViewUnderlyingData={handleViewUnderlyingData}
                    />
                )}

                {!isMinimal && item && value && canDrillInto && (
                    <Menu.Item
                        leftSection={<MantineIcon icon={IconArrowBarToDown} />}
                        onClick={handleOpenDrillIntoModal}
                    >
                        Drill into{' '}
                        <Text span fw={500}>
                            {value.formatted}
                        </Text>
                    </Menu.Item>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default BigNumberContextMenu;
