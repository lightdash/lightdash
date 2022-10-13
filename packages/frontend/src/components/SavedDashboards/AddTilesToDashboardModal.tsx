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
    DashboardChartTile,
    DashboardTileTypes,
    getDefaultChartTileSize,
    SavedChart,
} from '@lightdash/common';
import { FC, useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import {
    appendNewTilesToBottom,
    useCreateMutation,
    useDashboardQuery,
    useUpdateDashboard,
} from '../../hooks/dashboard/useDashboard';
import { useDashboards } from '../../hooks/dashboard/useDashboards';
import { useSavedQuery } from '../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaces,
} from '../../hooks/useSpaces';
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
    const { data: spaces } = useSpaces(projectUuid);

    const { data: dashboards, isLoading } = useDashboards(projectUuid);
    const [selectedDashboard, setSelectedDashboard] = useState<string>();
    const { data: dashboardData } = useDashboardQuery(selectedDashboard);
    const { mutate: updateMutation } = useUpdateMutation(selectedDashboard);
    const [name, setName] = useState<string>('');
    const [showNewDashboardInput, setShowNewDashboardInput] =
        useState<boolean>(false);
    const { data: completeSavedChart } = useSavedQuery(savedChart.uuid);
    const [newSpaceName, setNewSpaceName] = useState<string>('');
    const [spaceUuid, setSpaceUuid] = useState<string | undefined>();
    const {
        data: newSpace,
        mutate: spaceCreateMutation,
        isSuccess: hasCreateSpace,
        isLoading: isCreatingSpace,
        reset,
    } = useSpaceCreateMutation(projectUuid);
    const [showNewSpaceInput, setShowNewSpaceInput] = useState<boolean>(false);

    const showSpaceInput = showNewSpaceInput || spaces?.length === 0;
    useEffect(() => {
        if (spaceUuid === undefined && spaces && spaces.length > 0) {
            setSpaceUuid(spaces[0].uuid);
        }
    }, [spaces, spaceUuid]);
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

    const addChartToDashboard = useCallback(
        (selectedSpaceUuid: string | undefined) => {
            mutateCreate({
                name,
                spaceUuid: selectedSpaceUuid,
                tiles: [
                    {
                        uuid: uuid4(),
                        type: DashboardTileTypes.SAVED_CHART,

                        properties: {
                            savedChartUuid: savedChart.uuid,
                        },
                        ...getDefaultChartTileSize(
                            savedChart.chartConfig?.type ||
                                completeSavedChart?.chartConfig.type,
                        ),
                    },
                ],
            });

            setShowNewDashboardInput(false);

            setShowNewSpaceInput(false);
            setName('');
            if (onClose) onClose();
        },
        [
            name,
            savedChart.uuid,
            completeSavedChart?.chartConfig.type,
            mutateCreate,
            savedChart.chartConfig?.type,
            setShowNewDashboardInput,
            setShowNewSpaceInput,
            setName,
            onClose,
        ],
    );
    useEffect(() => {
        if (hasCreateSpace && newSpace) {
            addChartToDashboard(newSpace.uuid);
            reset();
        }
    }, [hasCreateSpace, newSpace, addChartToDashboard, reset]);
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
                                + Create new dashboard
                            </CreateNewText>
                        </>
                    )}

                    {showNewDashboardInput && (
                        <>
                            <FormGroup label="Name" labelFor="chart-name">
                                <InputGroup
                                    id="chart-name"
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="eg. KPI dashboard"
                                />
                            </FormGroup>
                            {!showSpaceInput && (
                                <>
                                    <p>
                                        <b>Select a space</b>
                                    </p>
                                    <HTMLSelect
                                        id="select-dashboard"
                                        fill={true}
                                        value={spaceUuid}
                                        onChange={(e) =>
                                            setSpaceUuid(e.currentTarget.value)
                                        }
                                        options={
                                            spaces
                                                ? spaces?.map((space) => ({
                                                      value: space.uuid,
                                                      label: space.name,
                                                  }))
                                                : []
                                        }
                                    />

                                    <CreateNewText
                                        onClick={() =>
                                            setShowNewSpaceInput(true)
                                        }
                                    >
                                        + Create new space
                                    </CreateNewText>
                                </>
                            )}
                            {showSpaceInput && (
                                <>
                                    <p>
                                        <b>Space</b>
                                    </p>
                                    <InputGroup
                                        id="chart-space"
                                        type="text"
                                        value={newSpaceName}
                                        onChange={(e) =>
                                            setNewSpaceName(e.target.value)
                                        }
                                        placeholder="eg. KPIs"
                                    />
                                </>
                            )}
                        </>
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
                                    if (showSpaceInput) {
                                        // We create first a space
                                        // Then we will create the saved chart
                                        // on isSuccess hook
                                        spaceCreateMutation({
                                            name: newSpaceName,
                                        });
                                    } else {
                                        addChartToDashboard(spaceUuid);
                                    }
                                } else if (dashboardData && updateMutation) {
                                    const newTile: DashboardChartTile = {
                                        uuid: uuid4(),
                                        type: DashboardTileTypes.SAVED_CHART,
                                        properties: {
                                            savedChartUuid: savedChart.uuid,
                                        },
                                        ...getDefaultChartTileSize(
                                            savedChart.chartConfig?.type ||
                                                completeSavedChart?.chartConfig
                                                    .type,
                                        ),
                                    };

                                    updateMutation({
                                        name: dashboardData.name,
                                        filters: dashboardData.filters,
                                        tiles: appendNewTilesToBottom(
                                            dashboardData.tiles,
                                            [newTile],
                                        ),
                                    });
                                    setShowNewDashboardInput(false);

                                    setShowNewSpaceInput(false);
                                    setName('');
                                    if (onClose) onClose();
                                }

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
