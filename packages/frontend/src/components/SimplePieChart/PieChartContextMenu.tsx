import { subject } from '@casl/ability';
import {
    createDashboardFilterRuleFromField,
    hasCustomBinDimension,
    isDimension,
    isFilterableDimension,
    type FilterDashboardToRule,
    type ResultRow,
    type ResultValue,
} from '@lightdash/common';
import { Box, Menu, Portal, Text, type MenuProps } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { IconArrowBarToDown, IconCopy, IconStack } from '@tabler/icons-react';
import { type FC } from 'react';
import { useLocation, useParams } from 'react-router';
import useToaster from '../../hooks/toaster/useToaster';
import { useProject } from '../../hooks/useProject';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { FilterDashboardTo } from '../DashboardFilter/FilterDashboardTo';
import { isPieVisualizationConfig } from '../LightdashVisualization/types';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import { useMetricQueryDataContext } from '../MetricQueryData/useMetricQueryDataContext';

export type PieChartContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    value?: ResultValue;
    rows?: ResultRow[];
} & Pick<MenuProps, 'position' | 'opened' | 'onOpen' | 'onClose'>;

const PieChartContextMenu: FC<PieChartContextMenuProps> = ({
    menuPosition,
    value,
    rows,
    opened,
    onOpen,
    onClose,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { data: project } = useProject(projectUuid);
    const { visualizationConfig } = useVisualizationContext();
    const location = useLocation();
    const isDashboardPage = location.pathname.includes('/dashboards');

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const tracking = useTracking(true);
    const metricQueryData = useMetricQueryDataContext(true);
    const { itemsMap } = useVisualizationContext();

    if (!value || !tracking || !metricQueryData || !project) {
        return null;
    }

    const { openUnderlyingDataModal, metricQuery } = metricQueryData;
    const { track } = tracking;

    if (!isPieVisualizationConfig(visualizationConfig)) return null;

    const { chartConfig } = visualizationConfig;

    const canViewUnderlyingData = user.data?.ability?.can(
        'view',
        subject('UnderlyingData', {
            organizationUuid: project?.organizationUuid,
            projectUuid: project?.projectUuid,
        }),
    );

    const canViewDrillInto =
        // TODO: implement this
        false &&
        user.data?.ability?.can(
            'manage',
            subject('Explore', {
                organizationUuid: project?.organizationUuid,
                projectUuid: project?.projectUuid,
            }),
        );

    const handleCopy = () => {
        if (value) {
            clipboard.copy(value.formatted);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const handleOpenUnderlyingDataModal = () => {
        if (!chartConfig.selectedMetric) return;

        const fieldValues = chartConfig.groupFieldIds.reduce<
            Record<string, ResultValue>
        >((acc, fieldId) => {
            if (!fieldId) return acc;

            const fieldValue = rows?.[0]?.[fieldId]?.value;
            if (!fieldValue) return acc;

            return { ...acc, [fieldId]: fieldValue };
        }, {});

        openUnderlyingDataModal({
            item: chartConfig.selectedMetric,
            value,
            fieldValues,
        });

        track({
            name: EventName.VIEW_UNDERLYING_DATA_CLICKED,
            properties: {
                organizationId: user?.data?.organizationUuid,
                userId: user?.data?.userUuid,
                projectId: projectUuid,
            },
        });
    };

    const handleOpenDrillIntoModal = () => {
        // TODO: implement this
        // openDrillDownModal({
        //     item,
        //     fieldValues: underlyingFieldValues,
        // });
        // track({
        //     name: EventName.DRILL_BY_CLICKED,
        //     properties: {
        //         organizationId: user.data?.organizationUuid,
        //         userId: user.data?.userUuid,
        //         projectId: projectUuid,
        //     },
        // });
    };

    const filters =
        isDashboardPage && itemsMap && rows && rows.length > 0
            ? Object.entries(rows[0]).reduce<FilterDashboardToRule[]>(
                  (acc, [key, v]) => {
                      const field = itemsMap[key];
                      if (isDimension(field) && isFilterableDimension(field)) {
                          const f = createDashboardFilterRuleFromField({
                              field,
                              availableTileFilters: {},
                              isTemporary: true,
                              value: v.value.raw,
                          });
                          return [...acc, f];
                      }
                      return acc;
                  },
                  [],
              )
            : [];

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            shadow="md"
            closeOnItemClick
            closeOnEscape
            radius={0}
            position="right-start"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
            }}
        >
            <Portal>
                <Menu.Target>
                    <Box
                        sx={{ position: 'absolute', ...(menuPosition ?? {}) }}
                    />
                </Menu.Target>
            </Portal>

            <Menu.Dropdown>
                <Menu.Item
                    icon={<MantineIcon icon={IconCopy} />}
                    onClick={handleCopy}
                >
                    Copy value
                </Menu.Item>

                {canViewUnderlyingData &&
                !hasCustomBinDimension(metricQuery) ? (
                    <Menu.Item
                        icon={<MantineIcon icon={IconStack} />}
                        onClick={handleOpenUnderlyingDataModal}
                    >
                        View underlying data
                    </Menu.Item>
                ) : null}
                {isDashboardPage && (
                    <FilterDashboardTo filters={filters ?? []} />
                )}
                {canViewDrillInto ? (
                    <Menu.Item
                        icon={<MantineIcon icon={IconArrowBarToDown} />}
                        onClick={handleOpenDrillIntoModal}
                    >
                        Drill into{' '}
                        <Text span fw={500}>
                            {value.formatted}
                        </Text>
                    </Menu.Item>
                ) : null}
            </Menu.Dropdown>
        </Menu>
    );
};

export default PieChartContextMenu;
