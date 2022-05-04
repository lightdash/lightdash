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
import { useLocation } from 'react-router-dom';
import {
    useAddVersionMutation,
    useDeleteMutation,
    useDuplicateMutation,
} from '../../../hooks/useSavedQuery';
import { useExplorer } from '../../../providers/ExplorerProvider';
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
    const location = useLocation<
        { fromExplorer?: boolean; explore?: boolean } | undefined
    >();
    const {
        state: {
            chartName,
            unsavedChartVersion,
            hasUnsavedChanges,
            savedChart,
        },
        queryResults,
        actions: { setPivotFields, setChartType, setChartConfig },
    } = useExplorer();
    const { isLoading: isDeleting } = useDeleteMutation();
    const update = useAddVersionMutation();
    const [vizIsOpen, setVizisOpen] = useState<boolean>(!!savedChart?.uuid);
    const chartId = savedChart?.uuid || '';
    const { mutate: duplicateChart } = useDuplicateMutation(chartId);

    const searchParams = new URLSearchParams(location.search);

    const overrideQueryUuid: string | undefined = searchParams.get('explore')
        ? undefined
        : savedChart?.uuid;

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
                    chartConfigs={savedChart?.chartConfig}
                    chartType={unsavedChartVersion.chartConfig.type}
                    pivotDimensions={savedChart?.pivotConfig?.columns}
                    tableName={unsavedChartVersion.tableName}
                    resultsData={queryResults.data}
                    isLoading={queryResults.isLoading}
                    onChartConfigChange={setChartConfig}
                    onChartTypeChange={setChartType}
                    onPivotDimensionsChange={setPivotFields}
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
                                onClick={() => setVizisOpen((f) => !f)}
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
                                            overrideQueryUuid
                                                ? 'Save changes'
                                                : 'Save chart'
                                        }
                                        disabled={
                                            !unsavedChartVersion.tableName ||
                                            !hasUnsavedChanges
                                        }
                                        onClick={
                                            overrideQueryUuid
                                                ? handleSavedQueryUpdate
                                                : () =>
                                                      setIsQueryModalOpen(true)
                                        }
                                    />
                                    {overrideQueryUuid && (
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
                    name={chartName || ''}
                    isChart
                    isExplorer
                />
            )}
        </>
    );
};

export default VisualizationCard;
