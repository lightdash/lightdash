import {
    Button,
    Classes,
    Dialog,
    Intent,
    NonIdealState,
} from '@blueprintjs/core';
import React, { FC, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import { useDashboards } from '../../../hooks/dashboard/useDashboards';
import { useMultipleUpdateMutation } from '../../../hooks/useSavedQuery';
import { useSavedCharts, useSpace } from '../../../hooks/useSpaces';
import Form from '../../ReactHookForm/Form';
import MultiSelect from '../../ReactHookForm/MultiSelect';

interface Props {
    isOpen: boolean;
    isChart?: boolean;
    onClose?: () => void;
}

type AddItemForm = {
    items: { value: string; label: string }[];
};

const AddToSpaceModal: FC<Props> = ({ isOpen, isChart, onClose }) => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();

    const { data: space } = useSpace(projectUuid, spaceUuid);
    /* const selectItems: any[] = []
    const isLoading = false 
    const isSaving = false*/

    const { mutate: chartMutation } = useMultipleUpdateMutation(projectUuid);

    //TODO reset on close
    const methods = useForm<AddItemForm>({
        mode: 'onSubmit',
    });

    // const { data: spaces, isLoading: isLoadingSpace } = useSpaces(projectUuid);

    const { data: savedCharts, isLoading } = useSavedCharts(projectUuid);
    const { data: dashboards } = useDashboards(projectUuid);

    const handleSubmit = useCallback(
        (formData: AddItemForm) => {
            if (isChart && savedCharts && formData.items) {
                const selectedCharts = formData.items.map((item) => {
                    const chart = savedCharts.find(
                        (savedChart) => savedChart.uuid === item.value,
                    );
                    return {
                        uuid: item.value,
                        name: chart?.name || '',
                        spaceUuid,
                    };
                });

                chartMutation(selectedCharts);
            }
        },
        [chartMutation, savedCharts, isChart, spaceUuid],
    );
    const allItems = isChart === true ? savedCharts : dashboards;

    if (allItems === undefined) {
        return <NonIdealState title="No results available" icon="search" />;
    }
    const selectItems = allItems.map(
        ({ uuid: itemUuid, name, spaceUuid: itemSpaceUuid }) => {
            const alreadyAddedChart = spaceUuid === itemSpaceUuid;
            return {
                value: itemUuid,
                label: name,
                disabled: alreadyAddedChart,
            };
        },
    );
    /*

    const { data: savedChart, isLoading: isLoadingChart } = useSavedQuery(
        isChart ? { id: uuid } : undefined,
    );
    const { data: dashboard, isLoading: isLoadingDashboard } =
        useDashboardQuery(!isChart ? uuid : undefined);

    const selectedItem: SavedChart | Dashboard | undefined = isChart
        ? savedChart
        : dashboard;
    const defaultSelectedSpaceUuid = selectedItem && selectedItem.spaceUuid;
    const isLoading = isLoadingSpace || isLoadingChart || isLoadingDashboard;
    const { mutate: chartMutation, isLoading: isSavingChart } =
        useUpdateMutation(uuid);
    const { mutate: dashboardMutation, isLoading: isSavingDashboard } =
        useUpdateDashboard(uuid);

    const isSaving = isSavingChart || isSavingDashboard;
    const [selectedSpaceUuid, setSelectedSpaceUuid] = useState<
        string | undefined
    >(defaultSelectedSpaceUuid);

    useEffect(() => {
        if (defaultSelectedSpaceUuid) {
            setSelectedSpaceUuid(defaultSelectedSpaceUuid);
        }
    }, [defaultSelectedSpaceUuid, setSelectedSpaceUuid]);

    const handleSubmit = useCallback(() => {
        if (selectedItem && selectedSpaceUuid) {
            const data = {
                name: selectedItem.name,
                spaceUuid: selectedSpaceUuid,
            };
            if (isChart) chartMutation(data);
            else dashboardMutation(data);
            if (onClose) onClose();
        }
    }, [
        chartMutation,
        dashboardMutation,
        isChart,
        onClose,
        selectedSpaceUuid,
        selectedItem,
    ]);
*/
    return (
        <Dialog
            isOpen={isOpen}
            onClose={onClose}
            lazy
            title={`Add ${isChart ? 'chart' : 'dashboard'} to space ${
                space?.name
            }`}
        >
            <Form
                name="add_items_to_space"
                methods={methods}
                onSubmit={handleSubmit}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Select the {isChart ? 'charts' : 'dashboards'} you want
                        to move into this space {space?.name}
                    </p>

                    <MultiSelect
                        name="items"
                        rules={{
                            required: 'Required field',
                        }}
                        items={selectItems}
                        disabled={isLoading}
                        defaultValue={[]}
                    />
                </div>
                <div className={Classes.DIALOG_FOOTER}>
                    <div className={Classes.DIALOG_FOOTER_ACTIONS}>
                        <Button onClick={onClose}>Cancel</Button>
                        <Button
                            intent={Intent.SUCCESS}
                            text={`Move ${isChart ? 'charts' : 'dashboards'}`}
                            disabled={isLoading}
                            type="submit"
                        />
                    </div>
                </div>
            </Form>
        </Dialog>
    );
};

export default AddToSpaceModal;
