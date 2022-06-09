import { Button, Collapse, H5 } from '@blueprintjs/core';
import { ChartType } from '@lightdash/common';
import { FC } from 'react';
import { useExplore } from '../../../hooks/useExplore';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import { ChartDownloadMenu } from '../../ChartDownload';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import VisualizationCardOptions from '../VisualizationCardOptions';
import {
    MainCard,
    VisualizationCardContentWrapper,
} from './VisualizationCard.styles';

const VisualizationCard: FC = () => {
    const {
        state: { isEditMode, unsavedChartVersion, expandedSections },
        queryResults,
        actions: {
            setPivotFields,
            setChartType,
            setChartConfig,
            toggleExpandedSection,
        },
    } = useExplorer();
    const { data: explore } = useExplore(unsavedChartVersion.tableName);
    const vizIsOpen = expandedSections.includes(ExplorerSection.VISUALIZATION);

    return (
        <>
            <MainCard elevation={1}>
                <VisualizationProvider
                    initialChartConfig={unsavedChartVersion.chartConfig}
                    chartType={unsavedChartVersion.chartConfig.type}
                    initialPivotDimensions={
                        unsavedChartVersion.pivotConfig?.columns
                    }
                    explore={explore}
                    resultsData={queryResults.data}
                    isLoading={queryResults.isLoading}
                    onChartConfigChange={setChartConfig}
                    onChartTypeChange={setChartType}
                    onPivotDimensionsChange={setPivotFields}
                    columnOrder={unsavedChartVersion.tableConfig.columnOrder}
                >
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                            }}
                        >
                            <Button
                                icon={
                                    vizIsOpen ? 'chevron-down' : 'chevron-right'
                                }
                                minimal
                                onClick={() =>
                                    toggleExpandedSection(
                                        ExplorerSection.VISUALIZATION,
                                    )
                                }
                            />
                            <H5 style={{ margin: 0, padding: 0 }}>Charts</H5>
                        </div>
                        {vizIsOpen && (
                            <div
                                style={{
                                    display: 'inline-flex',
                                    flexWrap: 'wrap',
                                    gap: '10px',
                                    marginRight: '10px',
                                }}
                            >
                                {isEditMode && (
                                    <>
                                        <VisualizationCardOptions />
                                        {unsavedChartVersion.chartConfig
                                            .type === ChartType.BIG_NUMBER ? (
                                            <BigNumberConfigPanel />
                                        ) : (
                                            <ChartConfigPanel />
                                        )}
                                    </>
                                )}
                                <ChartDownloadMenu />
                            </div>
                        )}
                    </div>
                    <Collapse className="explorer-chart" isOpen={vizIsOpen}>
                        <VisualizationCardContentWrapper className="cohere-block">
                            <LightdashVisualization />
                        </VisualizationCardContentWrapper>
                    </Collapse>
                </VisualizationProvider>
            </MainCard>
        </>
    );
};

export default VisualizationCard;
