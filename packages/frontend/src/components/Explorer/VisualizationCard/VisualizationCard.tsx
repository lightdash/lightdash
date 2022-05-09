import {
    Button,
    ButtonGroup,
    Card,
    Collapse,
    Divider,
    H5,
    Menu,
    MenuItem,
} from '@blueprintjs/core';
import { Popover2 } from '@blueprintjs/popover2';
import { ChartType } from 'common';
import { FC, useState } from 'react';
import {
    useAddVersionMutation,
    useDuplicateMutation,
} from '../../../hooks/useSavedQuery';
import {
    ExplorerSection,
    useExplorer,
} from '../../../providers/ExplorerProvider';
import BigNumberConfigPanel from '../../BigNumberConfig';
import ChartConfigPanel from '../../ChartConfigPanel';
import { ChartDownloadMenu } from '../../ChartDownload';
import DeleteActionModal from '../../common/modal/DeleteActionModal';
import LightdashVisualization from '../../LightdashVisualization';
import VisualizationProvider from '../../LightdashVisualization/VisualizationProvider';
import AddTilesToDashboardModal from '../../SavedDashboards/AddTilesToDashboardModal';
import CreateSavedQueryModal from '../../SavedQueries/CreateSavedQueryModal';
import VisualizationCardOptions from '../VisualizationCardOptions';

const VisualizationCard: FC = () => {
    const [isQueryModalOpen, setIsQueryModalOpen] = useState<boolean>(false);
    const [isAddToDashboardModalOpen, setIsAddToDashboardModalOpen] =
        useState<boolean>(false);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] =
        useState<boolean>(false);
    const {
        state: {
            unsavedChartVersion,
            hasUnsavedChanges,
            savedChart,
            expandedSections,
        },
        queryResults,
        actions: {
            setPivotFields,
            setChartType,
            setChartConfig,
            toggleExpandedSection,
        },
    } = useExplorer();
    const update = useAddVersionMutation();
    const vizIsOpen = expandedSections.includes(ExplorerSection.VISUALIZATION);
    const chartId = savedChart?.uuid || '';
    const { mutate: duplicateChart } = useDuplicateMutation(chartId);

    const handleSavedQueryUpdate = () => {
        if (savedChart?.uuid && unsavedChartVersion) {
            update.mutate({
                uuid: savedChart.uuid,
                payload: unsavedChartVersion,
            });
        }
    };

    return (
        <>
            <Card style={{ padding: 5, overflowY: 'scroll' }} elevation={1}>
                <VisualizationProvider
                    initialChartConfig={unsavedChartVersion.chartConfig}
                    chartType={unsavedChartVersion.chartConfig.type}
                    initialPivotDimensions={
                        unsavedChartVersion.pivotConfig?.columns
                    }
                    tableName={unsavedChartVersion.tableName}
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
                                <VisualizationCardOptions />
                                {unsavedChartVersion.chartConfig.type ===
                                ChartType.BIG_NUMBER ? (
                                    <BigNumberConfigPanel />
                                ) : (
                                    <ChartConfigPanel />
                                )}
                                <ChartDownloadMenu />
                                <ButtonGroup>
                                    <Button
                                        text={
                                            savedChart
                                                ? 'Save changes'
                                                : 'Save chart'
                                        }
                                        disabled={
                                            !unsavedChartVersion.tableName ||
                                            !hasUnsavedChanges
                                        }
                                        onClick={
                                            savedChart
                                                ? handleSavedQueryUpdate
                                                : () =>
                                                      setIsQueryModalOpen(true)
                                        }
                                    />
                                    {savedChart && (
                                        <Popover2
                                            placement="bottom"
                                            disabled={
                                                !unsavedChartVersion.tableName
                                            }
                                            content={
                                                <Menu>
                                                    <MenuItem
                                                        icon={
                                                            hasUnsavedChanges
                                                                ? 'add'
                                                                : 'duplicate'
                                                        }
                                                        text={
                                                            hasUnsavedChanges
                                                                ? 'Save chart as'
                                                                : 'Duplicate'
                                                        }
                                                        onClick={() => {
                                                            if (
                                                                savedChart?.uuid &&
                                                                hasUnsavedChanges
                                                            ) {
                                                                setIsQueryModalOpen(
                                                                    true,
                                                                );
                                                            } else {
                                                                duplicateChart(
                                                                    chartId,
                                                                );
                                                            }
                                                        }}
                                                    />
                                                    <MenuItem
                                                        icon="control"
                                                        text="Add to dashboard"
                                                        onClick={() =>
                                                            setIsAddToDashboardModalOpen(
                                                                true,
                                                            )
                                                        }
                                                    />
                                                    <Divider />
                                                    <MenuItem
                                                        icon="trash"
                                                        text="Delete"
                                                        intent="danger"
                                                        onClick={() =>
                                                            setIsDeleteDialogOpen(
                                                                true,
                                                            )
                                                        }
                                                    />
                                                </Menu>
                                            }
                                        >
                                            <Button
                                                icon="more"
                                                disabled={
                                                    !unsavedChartVersion.tableName
                                                }
                                            />
                                        </Popover2>
                                    )}
                                </ButtonGroup>
                            </div>
                        )}
                    </div>
                    <Collapse className="explorer-chart" isOpen={vizIsOpen}>
                        <div
                            style={{ height: '300px' }}
                            className="cohere-block"
                        >
                            <LightdashVisualization />
                        </div>
                    </Collapse>
                </VisualizationProvider>
            </Card>
            {unsavedChartVersion && (
                <CreateSavedQueryModal
                    isOpen={isQueryModalOpen}
                    savedData={unsavedChartVersion}
                    onClose={() => setIsQueryModalOpen(false)}
                />
            )}
            {savedChart && (
                <AddTilesToDashboardModal
                    isOpen={isAddToDashboardModalOpen}
                    savedChart={savedChart}
                    onClose={() => setIsAddToDashboardModalOpen(false)}
                />
            )}
            {isDeleteDialogOpen && savedChart?.uuid && (
                <DeleteActionModal
                    isOpen={isDeleteDialogOpen}
                    onClose={() => setIsDeleteDialogOpen(false)}
                    uuid={savedChart.uuid}
                    name={savedChart.name}
                    isChart
                    isExplorer
                />
            )}
        </>
    );
};

export default VisualizationCard;
