import { Button, Classes, Dialog, Icon, Intent } from '@blueprintjs/core';
import {
    Dashboard,
    DashboardTileTypes,
    defaultTileSize,
} from '@lightdash/common';
import React, { FC, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useSavedCharts, useSpaces } from '../../../hooks/useSpaces';
import { useDashboardContext } from '../../../providers/DashboardProvider';
import { SpaceLabel } from '../../Explorer/SpaceBrowser/AddResourceToSpaceModal.style';
import Form from '../../ReactHookForm/Form';
import MultiSelect from '../../ReactHookForm/MultiSelect';

type Props = {
    onAddTiles: (tiles: Dashboard['tiles'][number][]) => void;
    onClose: () => void;
};

type AddSavedChartsForm = {
    savedCharts: { value: string; label: string }[];
};

const AddChartTilesModal: FC<Props> = ({ onAddTiles, onClose }) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data: savedCharts, isLoading } = useSavedCharts(projectUuid);
    const { data: spaces } = useSpaces(projectUuid);
    const { dashboardTiles, dashboard } = useDashboardContext();
    const methods = useForm<AddSavedChartsForm>({
        mode: 'onSubmit',
    });

    const allSavedCharts = useMemo(() => {
        return (savedCharts || []).map(({ uuid, name, spaceUuid }) => {
            const alreadyAddedChart = dashboardTiles.find((tile) => {
                return (
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.savedChartUuid === uuid
                );
            });

            let subLabel = <></>;
            if (spaces && spaces.length > 1) {
                const space = spaces.find((sp) => sp.uuid === spaceUuid);

                if (space?.name) {
                    subLabel = (
                        <SpaceLabel>
                            <Icon size={12} icon="folder-close" />
                            {space.name}
                        </SpaceLabel>
                    );
                }
            }

            return {
                value: uuid,
                label: name,
                subLabel: subLabel,
                disabled: alreadyAddedChart !== undefined,
                title:
                    alreadyAddedChart &&
                    'This chart has been already added to this dashboard',
            };
        });
    }, [dashboardTiles, savedCharts, spaces]);

    const handleSubmit = (formData: AddSavedChartsForm) => {
        onAddTiles(
            formData.savedCharts.map(({ value }) => ({
                uuid: uuid4(),
                properties: {
                    savedChartUuid: value,
                },
                type: DashboardTileTypes.SAVED_CHART,
                ...defaultTileSize,
            })),
        );
        onClose();
    };

    const dashboardTitleName = dashboard?.name
        ? `"${dashboard.name}"`
        : 'dashboard';

    return (
        <Dialog
            isOpen={true}
            onClose={onClose}
            lazy
            title={`Add charts to ${dashboardTitleName}`}
        >
            <Form
                name="add_saved_charts_to_dashboard"
                methods={methods}
                onSubmit={handleSubmit}
            >
                <div className={Classes.DIALOG_BODY}>
                    <MultiSelect
                        name="savedCharts"
                        label={`Select the charts that you want to add to ${dashboardTitleName}`}
                        rules={{
                            required: 'Required field',
                        }}
                        items={allSavedCharts}
                        disabled={isLoading}
                        defaultValue={[]}
                    />
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            intent={Intent.PRIMARY}
                            text="Add"
                            type="submit"
                            disabled={isLoading}
                        />
                    </div>
                </div>
            </Form>
        </Dialog>
    );
};

export default AddChartTilesModal;
