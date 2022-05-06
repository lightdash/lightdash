import { Button, Divider, H3, MenuDivider, MenuItem } from '@blueprintjs/core';
import { AdditionalMetric, getTableMagicMetrics } from 'common';
import React, { useEffect } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import { useExplorer } from '../../../providers/ExplorerProvider';
import ExploreTree from '../../ExploreTree';
import { LineageButton } from '../../LineageButton';
import {
    ContentWrapper,
    LoadingStateWrapper,
    PanelTitleWrapper,
    TableTitle,
} from './ExplorePanel.styles';

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
    onBack: () => void;
};
export const ExplorerPanel = ({ onBack }: ExplorePanelProps) => {
    const {
        state: {
            activeFields,
            unsavedChartVersion: { tableName: activeTableName },
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
                <PanelTitleWrapper>
                    <Button onClick={onBack} icon="chevron-left" />
                    <H3 style={{ marginBottom: 0, marginLeft: '10px' }}>
                        {data.label}
                    </H3>
                </PanelTitleWrapper>
                <Divider />
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
                <p>
                    <b>Description</b>:{' '}
                    {activeExplore.tables[activeExplore.baseTable].description}
                </p>
                <div style={{ paddingBottom: '5px' }} />
                <Divider />
                <div style={{ paddingBottom: '10px' }} />
                <ExploreTree
                    explore={activeExplore}
                    selectedNodes={activeFields}
                    onSelectedFieldChange={toggleActiveField}
                />
            </>
        );
    }
    if (status === 'error') {
        onBack();
        return null;
    }
    return <span>Cannot load explore</span>;
};

export default ExplorerPanel;
