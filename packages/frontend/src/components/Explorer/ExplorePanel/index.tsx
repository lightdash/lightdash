import { MenuDivider } from '@blueprintjs/core';
import { Breadcrumbs2, MenuItem2, Tooltip2 } from '@blueprintjs/popover2';
import {
    AdditionalMetric,
    CompiledTable,
    extractEntityNameFromIdColumn,
    MetricType,
} from '@lightdash/common';
import React, { FC, useEffect } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import ExploreTree from '../ExploreTree';
import { LoadingStateWrapper, TableDivider } from './ExplorePanel.styles';

const getTableMagicMetrics = (
    table: CompiledTable,
): Record<string, AdditionalMetric> =>
    Object.values(table.dimensions).reduce((previous, dimension) => {
        const entityName = extractEntityNameFromIdColumn(dimension.name);
        if (entityName === null) {
            return previous;
        }
        const magicMetric: AdditionalMetric = {
            name: `${dimension.name}_count_distinct`,
            label: `Count distinct of ${dimension.label}`,
            description: `Count distinct of ${dimension.label} on the table ${dimension.tableLabel}. Lightdash has created this metric automatically.`,
            table: dimension.table,
            sql: dimension.sql,
            type: MetricType.COUNT_DISTINCT,
        };
        return { ...previous, [magicMetric.name]: magicMetric };
    }, {});

const SideBarLoadingState = () => (
    <LoadingStateWrapper large>
        {[0, 1, 2, 3, 4].map((idx) => (
            <React.Fragment key={idx}>
                <MenuItem2 className="bp4-skeleton" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </LoadingStateWrapper>
);

interface ExplorePanelProps {
    onBack?: () => void;
}

export const ExplorePanel: FC<ExplorePanelProps> = ({ onBack }) => {
    const {
        state: {
            activeFields,
            unsavedChartVersion: {
                tableName: activeTableName,
                metricQuery: { additionalMetrics },
            },
        },
        actions: { toggleActiveField, setMagicMetrics },
    } = useExplorer();
    const { data, status } = useExplore(activeTableName);

    useEffect(() => {
        if (data) {
            setMagicMetrics(
                Object.values(data.tables).reduce<AdditionalMetric[]>(
                    (sum, table) => {
                        const hasMetrics =
                            Object.values(table.metrics).length > 0;
                        return hasMetrics
                            ? [...sum]
                            : [
                                  ...sum,
                                  ...Object.values(getTableMagicMetrics(table)),
                              ];
                    },
                    [],
                ),
            );
        }
    }, [data, setMagicMetrics]);

    if (status === 'loading') {
        return <SideBarLoadingState />;
    }

    if (data) {
        const tableBreadcrumbItem = {
            children: (
                <Tooltip2 content={data.tables[data.baseTable].description}>
                    {data.label}
                </Tooltip2>
            ),
        };

        return (
            <>
                <Breadcrumbs2
                    items={
                        onBack
                            ? [
                                  {
                                      text: 'Tables',
                                      className: 'home-breadcrumb',
                                      onClick: onBack,
                                  },
                                  tableBreadcrumbItem,
                              ]
                            : [tableBreadcrumbItem]
                    }
                />

                <TableDivider />

                <ExploreTree
                    explore={data}
                    additionalMetrics={additionalMetrics || []}
                    selectedNodes={activeFields}
                    onSelectedFieldChange={toggleActiveField}
                />
            </>
        );
    }

    if (status === 'error') {
        if (onBack) onBack();
        return null;
    }

    return <span>Cannot load explore</span>;
};

export default ExplorePanel;
