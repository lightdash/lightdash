import {
    Button,
    Classes,
    Dialog,
    FormGroup,
    HTMLSelect,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import {
    DashboardTileTypes,
    getDefaultChartTileSize,
    SavedChart,
} from 'common';
import { FC, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import {
    useCreateMutation,
    useDashboardQuery,
    useUpdateDashboard,
} from '../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import { CreateNewText } from './AddTilesToDashboardModal.styles';

interface AddTilesToDashboardModalProps {
    isOpen: boolean;
    savedChart: SavedChart | any;
    onClose?: () => void;
}

const useUpdateMutation = (id?: string) => {
    const hook = useUpdateDashboard(id || '', true);
    if (id) {
        return hook;
    }
    return { mutate: undefined };
};

const AddTilesToDashboardModal: FC<AddTilesToDashboardModalProps> = ({
    isOpen,
    savedChart,
    onClose,
}) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const useCreate = useCreateMutation(projectUuid, true);
    const { mutate: mutateCreate } = useCreate;
    const { data: dashboards, isLoading } = useDashboards(projectUuid);
    const [selectedDashboard, setSelectedDashboard] = useState<string>();
    const { data: dashboardData } = useDashboardQuery(selectedDashboard);
    const { mutate: updateMutation } = useUpdateMutation(selectedDashboard);
    const [name, setName] = useState<string>('');
    const [showNewDashboardInput, setShowNewDashboardInput] =
        useState<boolean>(false);
    const { data: completeSavedChart } = useSavedQuery(savedChart.uuid);

    useEffect(() => {
        if (dashboards && !dashboardData && !isLoading) {
            if (dashboards.length > 0) setSelectedDashboard(dashboards[0].uuid);
        }
        // If no dashboards, we always show the ""
        if (
            dashboards &&
            dashboards.length === 0 &&
            !isLoading &&
            !showNewDashboardInput
        ) {
            setShowNewDashboardInput(true);
        }
    }, [dashboards, isLoading, dashboardData, showNewDashboardInput]);

    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title="Add chart to dashboard"
        >
            <form>
                <div className={Classes.DIALOG_BODY}>
                    {!showNewDashboardInput && (
                        <>
                            <p>
                                <b>Select a dashboard</b>
                            </p>
                            <HTMLSelect
                                id="select-dashboard"
                                fill={true}
                                value={selectedDashboard}
                                onChange={(e) =>
                                    setSelectedDashboard(e.currentTarget.value)
                                }
                                options={
                                    dashboards
                                        ? dashboards.map((dashboard) => ({
                                              value: dashboard.uuid,
                                              label: dashboard.name,
                                          }))
                                        : []
                                }
                            />

                            <CreateNewText
                                onClick={() => setShowNewDashboardInput(true)}
                            >
                                + Create new
                            </CreateNewText>
                        </>
                    )}

                    {showNewDashboardInput && (
                        <FormGroup label="Name" labelFor="chart-name">
                            <InputGroup
                                id="chart-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="eg. KPI dashboard"
                            />
                        </FormGroup>
                    )}
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button
                            onClick={() => {
                                if (onClose) onClose();
                                setShowNewDashboardInput(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            data-cy="submit-base-modal"
                            intent={Intent.SUCCESS}
                            text={'Add'}
                            type="submit"
                            onClick={(e) => {
                                if (showNewDashboardInput) {
                                    mutateCreate({
                                        name,
                                        tiles: [
                                            {
                                                uuid: uuid4(),
                                                type: DashboardTileTypes.SAVED_CHART,
                                                properties: {
                                                    savedChartUuid:
                                                        savedChart.uuid,
                                                },
                                                ...getDefaultChartTileSize(
                                                    savedChart.chartConfig
                                                        ?.type ||
                                                        completeSavedChart
                                                            ?.chartConfig.type,
                                                ),
                                            },
                                        ],
                                    });
                                } else if (dashboardData && updateMutation) {
                                    updateMutation({
                                        name: dashboardData.name,
                                        filters: dashboardData.filters,
                                        tiles: [
                                            ...dashboardData.tiles,
                                            {
                                                uuid: uuid4(),
                                                type: DashboardTileTypes.SAVED_CHART,
                                                properties: {
                                                    savedChartUuid:
                                                        savedChart.uuid,
                                                },
                                                ...getDefaultChartTileSize(
                                                    savedChart.chartConfig
                                                        ?.type ||
                                                        completeSavedChart
                                                            ?.chartConfig.type,
                                                ),
                                            },
                                        ],
                                    });
                                }

                                if (onClose) onClose();
                                setShowNewDashboardInput(false);
                                setName('');

                                e.preventDefault();
                            }}
                            disabled={showNewDashboardInput && name === ''}
                        />
                    </div>
                </div>
            </form>
        </Dialog>
    );
};

export default AddTilesToDashboardModal;
