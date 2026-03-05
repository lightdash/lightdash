import { subject } from '@casl/ability';
import {
    createDashboardFilterRuleFromField,
    isDimension,
    isFilterableDimension,
    isMetric,
    type FilterDashboardToRule,
} from '@lightdash/common';
import {
    Box,
    Menu,
    Portal,
    Stack,
    Text,
    type MenuProps,
} from '@mantine-8/core';
import { useClipboard } from '@mantine/hooks';
import { IconCopy } from '@tabler/icons-react';
import mapValues from 'lodash/mapValues';
import { useMemo, type FC } from 'react';
import { useLocation } from 'react-router';
import { FilterDashboardTo } from '../../features/dashboardFilters/FilterDashboardTo';
import type { TooltipFieldInfo } from '../../hooks/leaflet/useLeafletMapConfig';
import useToaster from '../../hooks/toaster/useToaster';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { Can } from '../../providers/Ability';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import { useVisualizationContext } from '../LightdashVisualization/useVisualizationContext';
import DrillDownMenuItem from '../MetricQueryData/DrillDownMenuItem';

const getFormattedValue = (
    rowData: Record<string, any>,
    fieldId: string,
): string => {
    const field = rowData[fieldId];
    if (!field) return '';
    return field.value?.formatted ?? field.value?.raw ?? '';
};

export type MapContextMenuProps = {
    menuPosition?: {
        left: number;
        top: number;
    };
    rowData?: Record<string, any>;
    copyValue?: string;
    tooltipFields: TooltipFieldInfo[];
    lat?: number;
    lon?: number;
    noData?: {
        locationLabel: string;
        locationValue: string;
    };
} & Pick<MenuProps, 'opened' | 'onClose'>;

const MapContextMenu: FC<MapContextMenuProps> = ({
    menuPosition,
    rowData,
    copyValue,
    tooltipFields,
    lat,
    lon,
    noData,
    opened,
    onClose,
}) => {
    const location = useLocation();
    const isDashboardPage = location.pathname.includes('/dashboards');

    const { showToastSuccess } = useToaster();
    const clipboard = useClipboard({ timeout: 200 });
    const { itemsMap } = useVisualizationContext();
    const { user } = useApp();
    const projectUuid = useProjectUuid();

    const fieldValues = useMemo(
        () => (rowData ? mapValues(rowData, (v) => v?.value) : undefined),
        [rowData],
    );

    const visibleFields = tooltipFields.filter((f) => f.visible);

    const drillMetricItem = useMemo(() => {
        if (!itemsMap) return undefined;
        return visibleFields
            .map((f) => itemsMap[f.fieldId])
            .find((f) => f && isMetric(f));
    }, [visibleFields, itemsMap]);

    if ((!rowData && !noData) || !itemsMap) {
        return null;
    }

    const handleCopy = () => {
        if (copyValue) {
            clipboard.copy(copyValue);
            showToastSuccess({
                title: 'Copied to clipboard!',
            });
        }
    };

    const tooltipFieldIds = new Set(tooltipFields.map((f) => f.fieldId));

    const filters: FilterDashboardToRule[] =
        isDashboardPage && rowData
            ? Object.entries(rowData).reduce<FilterDashboardToRule[]>(
                  (acc, [key, v]) => {
                      if (!tooltipFieldIds.has(key)) return acc;
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
                        pos="absolute"
                        left={menuPosition?.left}
                        top={menuPosition?.top}
                    />
                </Menu.Target>
            </Portal>

            <Menu.Dropdown>
                {noData ? (
                    <Box p="xs">
                        <Text size="sm">
                            <strong>{noData.locationLabel}:</strong>{' '}
                            {noData.locationValue}
                        </Text>
                        <Text size="sm" c="dimmed" fs="italic">
                            No data
                        </Text>
                    </Box>
                ) : (
                    rowData &&
                    visibleFields.length > 0 && (
                        <Box p="xs">
                            <Stack gap={2}>
                                {visibleFields.map((field) => (
                                    <Text key={field.fieldId} size="sm">
                                        <strong>{field.label}:</strong>{' '}
                                        {getFormattedValue(
                                            rowData,
                                            field.fieldId,
                                        )}
                                    </Text>
                                ))}
                            </Stack>
                            {lat !== undefined && lon !== undefined && (
                                <Text size="xs" c="dimmed" mt="xs">
                                    Lat: {lat.toFixed(4)}, Lon: {lon.toFixed(4)}
                                </Text>
                            )}
                        </Box>
                    )
                )}

                {(copyValue || (rowData && fieldValues && drillMetricItem)) && (
                    <>
                        <Menu.Divider />
                        {copyValue && (
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconCopy} />}
                                onClick={handleCopy}
                            >
                                {visibleFields.length > 1
                                    ? 'Copy values'
                                    : 'Copy value'}
                            </Menu.Item>
                        )}
                        {rowData && fieldValues && drillMetricItem && (
                            <Can
                                I="manage"
                                this={subject('Explore', {
                                    organizationUuid:
                                        user.data?.organizationUuid,
                                    projectUuid,
                                })}
                            >
                                <DrillDownMenuItem
                                    item={drillMetricItem}
                                    fieldValues={fieldValues}
                                    trackingData={{
                                        organizationId:
                                            user?.data?.organizationUuid,
                                        userId: user?.data?.userUuid,
                                        projectId: projectUuid,
                                    }}
                                />
                            </Can>
                        )}
                    </>
                )}

                {isDashboardPage && filters.length > 0 && (
                    <>
                        <FilterDashboardTo filters={filters} />
                    </>
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default MapContextMenu;
