import { Button, Classes, Dialog, Intent } from '@blueprintjs/core';
import {
    Dashboard,
    DashboardTileTypes,
    defaultTileSize,
} from '@lightdash/common';
import { FC } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { v4 as uuid4 } from 'uuid';
import { useSavedCharts } from '../../../hooks/useSpaces';
import { useDashboardContext } from '../../../providers/DashboardProvider';
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
    const { data, isLoading } = useSavedCharts(projectUuid);
    const methods = useForm<AddSavedChartsForm>({
        mode: 'onSubmit',
    });
    const { dashboardTiles } = useDashboardContext();
    const allSavedCharts =
        data?.map(({ uuid, name }) => {
            const alreadyAddedChart = dashboardTiles.find(
                (tile) =>
                    tile.type === DashboardTileTypes.SAVED_CHART &&
                    tile.properties.savedChartUuid === uuid,
            );
            return {
                value: uuid,
                label: name,
                disabled: alreadyAddedChart !== undefined,
                title:
                    alreadyAddedChart &&
                    'This chart has been already added to this dashboard',
            };
        }) || [];
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
    return (
        <Dialog
            isOpen={true}
            onClose={onClose}
            lazy
            title="Add tiles to dashboard"
        >
            <Form
                name="add_saved_charts_to_dashboard"
                methods={methods}
                onSubmit={handleSubmit}
            >
                <div className={Classes.DIALOG_BODY}>
                    <MultiSelect
                        name="savedCharts"
                        label="Select saved charts"
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
