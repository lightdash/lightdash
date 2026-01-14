import {
    createDashboardFilterRuleFromField,
    isDimension,
    isDimensionValueInvalidDate,
    type ItemsMap,
    type ResultValue,
} from '@lightdash/common';
import { Menu, Text, type MenuProps } from '@mantine/core';
import { IconArrowBarToDown, IconCopy } from '@tabler/icons-react';
import { type FC } from 'react';
import { useLocation, useParams } from 'react-router';
import { FilterDashboardTo } from '../../../features/dashboardFilters/FilterDashboardTo';
import { useContextMenuPermissions } from '../../../hooks/useContextMenuPermissions';
import { useProject } from '../../../hooks/useProject';
import { useAccount } from '../../../hooks/user/useAccount';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { UnderlyingDataMenuItem } from '../../DashboardTiles/UnderlyingDataMenuItem';
import { useMetricQueryDataContext } from '../../MetricQueryData/useMetricQueryDataContext';
import MantineIcon from '../MantineIcon';

type ValueCellMenuProps = {
    value?: ResultValue | null;
    onCopy: () => void;

    rowIndex?: number;
    colIndex?: number;
    item?: ItemsMap[string] | undefined;
    getUnderlyingFieldValues?: (
        colIndex: number,
        rowIndex: number,
    ) => Record<string, ResultValue>;
    isMinimal?: boolean;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const ValueCellMenu: FC<React.PropsWithChildren<ValueCellMenuProps>> = ({
    children,
    rowIndex,
    colIndex,
    getUnderlyingFieldValues,
    item,
    value,
    opened,
    onOpen,
    onClose,
    onCopy,
    isMinimal = false,
}) => {
    const tracking = useTracking({ failSilently: true });
    const metricQueryData = useMetricQueryDataContext(true);
    const { data: account } = useAccount();

    // FIXME: get rid of this from here
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: project } = useProject(projectUuid);
    const location = useLocation();
    const isDashboardPage = location.pathname.includes('/dashboards');

    const { canDrillInto, canViewUnderlyingData } = useContextMenuPermissions({
        minimal: isMinimal,
    });

    if (!value || !tracking || !metricQueryData) {
        return <>{children}</>;
    }

    const { openUnderlyingDataModal, openDrillDownModal, metricQuery } =
        metricQueryData;
    const { track } = tracking;

    const hasUnderlyingData = getUnderlyingFieldValues && item;
    const hasDrillInto = getUnderlyingFieldValues && item;

    const handleOpenUnderlyingDataModal = () => {
        if (
            !getUnderlyingFieldValues ||
            !item ||
            rowIndex === undefined ||
            colIndex === undefined
        ) {
            return;
        }

        const underlyingFieldValues = getUnderlyingFieldValues(
            rowIndex,
            colIndex,
        );

        openUnderlyingDataModal({
            item,
            value,
            fieldValues: underlyingFieldValues,
        });
    };

    const handleOpenDrillIntoModal = () => {
        if (
            !getUnderlyingFieldValues ||
            !item ||
            rowIndex === undefined ||
            colIndex === undefined
        ) {
            return;
        }

        const underlyingFieldValues = getUnderlyingFieldValues(
            rowIndex,
            colIndex,
        );

        openDrillDownModal({
            item,
            fieldValues: underlyingFieldValues,
        });

        track({
            name: EventName.DRILL_BY_CLICKED,
            properties: {
                organizationId: project?.organizationUuid,
                userId: account?.user?.id,
                projectId: projectUuid,
            },
        });
    };

    const filterValue =
        value.raw === undefined ||
        (isDimension(item) && isDimensionValueInvalidDate(item, value))
            ? null // Set as null if value is invalid date or undefined
            : value.raw;

    const filters =
        isDashboardPage && isDimension(item) && !item.hidden
            ? [
                  createDashboardFilterRuleFromField({
                      field: item,
                      availableTileFilters: {},
                      isTemporary: true,
                      value: filterValue,
                  }),
              ]
            : [];

    return (
        <Menu
            opened={opened}
            onOpen={onOpen}
            onClose={onClose}
            withinPortal
            closeOnItemClick
            closeOnEscape
            shadow="md"
            radius={0}
            position="bottom-end"
            offset={{
                mainAxis: 0,
                crossAxis: 0,
            }}
        >
            <Menu.Target>{children}</Menu.Target>

            <Menu.Dropdown>
                <Menu.Item
                    icon={
                        <MantineIcon
                            icon={IconCopy}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={onCopy}
                >
                    Copy value
                </Menu.Item>

                {hasUnderlyingData &&
                    !isDimension(item) &&
                    metricQuery &&
                    canViewUnderlyingData && (
                        <UnderlyingDataMenuItem
                            metricQuery={metricQuery}
                            onViewUnderlyingData={handleOpenUnderlyingDataModal}
                        />
                    )}

                {!isMinimal && hasDrillInto && canDrillInto && project && (
                    <Menu.Item
                        icon={
                            <MantineIcon
                                icon={IconArrowBarToDown}
                                size="md"
                                fillOpacity={0}
                            />
                        }
                        onClick={handleOpenDrillIntoModal}
                    >
                        Drill into{' '}
                        <Text span fw={500}>
                            {value.formatted}
                        </Text>
                    </Menu.Item>
                )}
                {isDashboardPage && filters.length > 0 && (
                    <FilterDashboardTo filters={filters} />
                )}
            </Menu.Dropdown>
        </Menu>
    );
};

export default ValueCellMenu;
