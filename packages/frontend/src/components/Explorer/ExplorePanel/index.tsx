import { Button, Collapse, MenuDivider, MenuItem } from '@blueprintjs/core';
import { Breadcrumbs2, Tooltip2 } from '@blueprintjs/popover2';
import {
    AdditionalMetric,
    CompiledTable,
    extractEntityNameFromIdColumn,
    MetricType,
} from '@lightdash/common';
import React, { useEffect, useState } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import { LineageButton } from '../../LineageButton';
import ExploreTree from '../ExploreTree';
import {
    ContentWrapper,
    ExpandableHeader,
    ExpandableWrapper,
    LoadingStateWrapper,
    TableDescription,
    TableDivider,
    TableTitle,
} from './ExplorePanel.styles';

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
                <MenuItem className="bp4-skeleton" />
                <MenuDivider />
            </React.Fragment>
        ))}
    </LoadingStateWrapper>
);

type ExplorePanelProps = {
    onBack?: () => void;
};
export const ExplorerPanel = ({ onBack }: ExplorePanelProps) => {
    const [headerIsOpen, setHeaderIsOpen] = useState<boolean>(false);
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
        const activeExplore = data;
        const [databaseName, schemaName, tableName] = activeExplore.tables[
            activeExplore.baseTable
        ].sqlTable
            .replace(/["'`]/g, '')
            .split('.');

        return (
            <>
                <ExpandableWrapper>
                    <ExpandableHeader>
                        <Breadcrumbs2
                            items={
                                onBack
                                    ? [
                                          {
                                              text: 'Tables',
                                              className: 'home-breadcrumb',
                                              onClick: onBack,
                                          },
                                          { text: data.label },
                                      ]
                                    : [{ text: data.label }]
                            }
                        />

                        <Tooltip2
                            content={`${
                                headerIsOpen ? 'Hide' : 'View'
                            } table information`}
                            position="right"
                        >
                            <Button
                                icon={
                                    headerIsOpen ? 'chevron-up' : 'chevron-down'
                                }
                                minimal
                                onClick={() => setHeaderIsOpen((prev) => !prev)}
                            />
                        </Tooltip2>
                    </ExpandableHeader>

                    <Collapse isOpen={headerIsOpen}>
                        <ContentWrapper>
                            <TableTitle>
                                <b>Table</b>: {tableName}
                            </TableTitle>
                            <LineageButton />
                        </ContentWrapper>
                        <p>
                            <b>Schema</b>: {schemaName}
                        </p>
                        <p>
                            <b>Database</b>: {databaseName}
                        </p>
                        <TableDescription>
                            <b>Description</b>:{' '}
                            {
                                activeExplore.tables[activeExplore.baseTable]
                                    .description
                            }
                        </TableDescription>
                    </Collapse>
                </ExpandableWrapper>

                <TableDivider />

                <ExploreTree
                    explore={activeExplore}
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

export default ExplorerPanel;
