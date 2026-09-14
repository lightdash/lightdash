import {
    createDashboardFilterRuleFromField,
    isDimension,
    isDimensionValueInvalidDate,
    isField,
    isMetric,
    type Field,
    type ItemsMap,
    type ResultValue,
} from '@lightdash/common';
import { Menu, type MenuProps, Text } from '@mantine/core';
import { IconArrowBarToDown, IconCopy } from '@tabler/icons-react';
import { memo, useState, type FC } from 'react';
import { useLocation } from 'react-router';
import { FilterDashboardTo } from '../../../features/dashboardFilters/FilterDashboardTo';
import { useContextMenuPermissions } from '../../../hooks/useContextMenuPermissions';
import { useProject } from '../../../hooks/useProject';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useAccount } from '../../../hooks/user/useAccount';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { UnderlyingDataMenuItem } from '../../DashboardTiles/UnderlyingDataMenuItem';
import {
    type GetTemplatedUrlItem,
    type TemplatedUrlRowContext,
} from '../../Explorer/ResultsCard/templatedUrlRowContext';
import { TemplatedUrlMenuItems } from '../../Explorer/ResultsCard/UrlMenuItems';
import { useMetricQueryDataContext } from '../../MetricQueryData/useMetricQueryDataContext';
import MantineIcon from '../MantineIcon';

/**
 * Templated URL actions for a cell. `field` is the field whose `urls` apply,
 * which is not always the cell's display `item` (metricsAsRows swaps the
 * dimension for the row metric). `getRowContext` runs when the menu opens.
 */
export type ValueCellUrlActions = {
    field: Field | undefined;
    getRowContext: () => TemplatedUrlRowContext;
    getItem: GetTemplatedUrlItem;
};

type ValueCellMenuProps = {
    value?: ResultValue | null;
    onCopy: () => void;

    rowIndex?: number;
    colIndex?: number;
    item?: ItemsMap[string] | undefined;
    urlActions?: ValueCellUrlActions;
    getUnderlyingFieldValues?: (
        colIndex: number,
        rowIndex: number,
    ) => Record<string, ResultValue>;
    isMinimal?: boolean;
} & Pick<MenuProps, 'opened' | 'onOpen' | 'onClose'>;

const CopyValueMenuItem: FC<{ onCopy: () => void }> = ({ onCopy }) => (
    <Menu.Item
        leftSection={<MantineIcon icon={IconCopy} size="md" fillOpacity={0} />}
        onClick={onCopy}
    >
        Copy value
    </Menu.Item>
);

const UrlMenuSection: FC<{
    value: ResultValue;
    urlActions: ValueCellUrlActions;
    isMinimal: boolean;
}> = ({ value, urlActions, isMinimal }) => {
    // Resolved once per open: the dropdown content mounts when the menu opens.
    const [rowContext] = useState(urlActions.getRowContext);

    const urls = urlActions.field?.urls;
    if (!urls?.length || value.raw === undefined || value.raw === null) {
        return null;
    }

    return (
        <>
            <TemplatedUrlMenuItems
                urls={urls}
                value={value}
                rowContext={rowContext}
                getItem={urlActions.getItem}
                showErrors={!isMinimal}
            />
            <Menu.Divider />
        </>
    );
};

/**
 * Inner dropdown content that is only mounted when the menu is opened.
 * This avoids running expensive hooks (useProject, useAccount, etc.)
 * for every cell in the pivot table — only the opened cell pays the cost.
 */
const ValueCellMenuDropdownContent: FC<{
    value: ResultValue;
    item?: ItemsMap[string] | undefined;
    urlActions: ValueCellUrlActions | undefined;
    rowIndex?: number;
    colIndex?: number;
    getUnderlyingFieldValues?: (
        colIndex: number,
        rowIndex: number,
    ) => Record<string, ResultValue>;
    isMinimal: boolean;
    onCopy: () => void;
}> = ({
    value,
    item,
    urlActions,
    rowIndex,
    colIndex,
    getUnderlyingFieldValues,
    isMinimal,
    onCopy,
}) => {
    const tracking = useTracking({ failSilently: true });
    const metricQueryData = useMetricQueryDataContext(true);
    const { data: account } = useAccount();
    const projectUuid = useProjectUuid();
    const { data: project } = useProject(projectUuid);
    const location = useLocation();
    const isDashboardPage = location.pathname.includes('/dashboards');
    const { canDrillInto, canViewUnderlyingData } = useContextMenuPermissions({
        minimal: isMinimal,
    });

    const urlSection = urlActions && (
        <UrlMenuSection
            value={value}
            urlActions={urlActions}
            isMinimal={isMinimal}
        />
    );

    if (!tracking || !metricQueryData) {
        return (
            <Menu.Dropdown>
                {urlSection}
                <CopyValueMenuItem onCopy={onCopy} />
            </Menu.Dropdown>
        );
    }

    const { openUnderlyingDataModal, openDrillDownModal, metricQuery } =
        metricQueryData;
    const { track } = tracking;

    const hasUnderlyingData = getUnderlyingFieldValues && item;
    const hasDrillInto =
        getUnderlyingFieldValues && item && isField(item) && isMetric(item);

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
            ? null
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
        <Menu.Dropdown>
            {urlSection}
            <CopyValueMenuItem onCopy={onCopy} />

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
                    leftSection={
                        <MantineIcon
                            icon={IconArrowBarToDown}
                            size="md"
                            fillOpacity={0}
                        />
                    }
                    onClick={handleOpenDrillIntoModal}
                >
                    <>
                        Drill into{' '}
                        <Text span fw={500}>
                            {value.formatted}
                        </Text>
                    </>
                </Menu.Item>
            )}
            {isDashboardPage && filters.length > 0 && (
                <FilterDashboardTo filters={filters} />
            )}
        </Menu.Dropdown>
    );
};

const ValueCellMenu: FC<React.PropsWithChildren<ValueCellMenuProps>> = memo(
    ({
        children,
        rowIndex,
        colIndex,
        getUnderlyingFieldValues,
        item,
        urlActions,
        value,
        opened,
        onOpen,
        onClose,
        onCopy,
        isMinimal = false,
    }) => {
        if (!value) {
            return <>{children}</>;
        }

        return (
            <Menu
                opened={opened}
                onOpen={onOpen}
                onClose={onClose}
                closeOnItemClick
                closeOnEscape
                radius={0}
                position="bottom-end"
                offset={{
                    mainAxis: 0,
                    crossAxis: 0,
                }}
            >
                <Menu.Target>{children}</Menu.Target>

                {opened && (
                    <ValueCellMenuDropdownContent
                        value={value}
                        item={item}
                        urlActions={urlActions}
                        rowIndex={rowIndex}
                        colIndex={colIndex}
                        getUnderlyingFieldValues={getUnderlyingFieldValues}
                        isMinimal={isMinimal}
                        onCopy={onCopy}
                    />
                )}
            </Menu>
        );
    },
);

export default ValueCellMenu;
