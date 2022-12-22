import {
    Button,
    Classes,
    Dialog,
    Icon,
    Intent,
    NonIdealState,
} from '@blueprintjs/core';
import { assertUnreachable } from '@lightdash/common';
import { FC, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router-dom';
import {
    useDashboards,
    useUpdateMultipleDashboard,
} from '../../../hooks/dashboard/useDashboards';
import { useUpdateMultipleMutation } from '../../../hooks/useSavedQuery';
import { useSavedCharts, useSpace, useSpaces } from '../../../hooks/useSpaces';
import Form from '../../ReactHookForm/Form';
import MultiSelect from '../../ReactHookForm/MultiSelect';
import { SpaceLabel } from './AddResourceToSpaceModal.style';

export enum AddToSpaceResources {
    DASHBOARD = 'dashboard',
    CHART = 'chart',
}

const getResourceTypeLabel = (resourceType: AddToSpaceResources) => {
    switch (resourceType) {
        case AddToSpaceResources.DASHBOARD:
            return 'Dashboard';
        case AddToSpaceResources.CHART:
            return 'Chart';
        default:
            return assertUnreachable(
                resourceType,
                'Unexpected resource type when getting label',
            );
    }
};

type AddItemForm = {
    items: { value: string; label: string }[];
};

interface Props {
    isOpen: boolean;
    resourceType: AddToSpaceResources;
    onClose?: () => void;
}

const AddResourceToSpaceModal: FC<Props> = ({
    isOpen,
    resourceType,
    onClose,
}) => {
    const { projectUuid, spaceUuid } = useParams<{
        projectUuid: string;
        spaceUuid: string;
    }>();

    const { data: space } = useSpace(projectUuid, spaceUuid);
    const { data: spaces } = useSpaces(projectUuid);

    const { mutate: chartMutation } = useUpdateMultipleMutation(projectUuid);
    const { mutate: dashboardMutation } =
        useUpdateMultipleDashboard(projectUuid);

    const methods = useForm<AddItemForm>({
        mode: 'onSubmit',
    });

    const { data: savedCharts, isLoading } = useSavedCharts(projectUuid);
    const { data: dashboards } = useDashboards(projectUuid);

    const closeModal = useCallback(() => {
        methods.reset();
        if (onClose) onClose();
    }, [methods, onClose]);

    const handleSubmit = useCallback(
        (formData: AddItemForm) => {
            switch (resourceType) {
                case AddToSpaceResources.CHART:
                    if (savedCharts && formData.items) {
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
                    break;
                case AddToSpaceResources.DASHBOARD:
                    if (dashboards && formData.items) {
                        const selectedDashboards = formData.items.map(
                            (item) => {
                                const dashboard = dashboards.find(
                                    (dash) => dash.uuid === item.value,
                                );
                                return {
                                    uuid: item.value,
                                    name: dashboard?.name || '',
                                    spaceUuid,
                                };
                            },
                        );

                        dashboardMutation(selectedDashboards);
                    }
                    break;
            }

            closeModal();
        },
        [
            chartMutation,
            savedCharts,
            resourceType,
            spaceUuid,
            dashboardMutation,
            dashboards,
            closeModal,
        ],
    );

    const allItems =
        resourceType === AddToSpaceResources.CHART ? savedCharts : dashboards;

    if (allItems === undefined) {
        return <NonIdealState title="No results available" icon="search" />;
    }
    const selectItems = allItems.map(
        ({ uuid: itemUuid, name, spaceUuid: itemSpaceUuid }) => {
            const disabled = spaceUuid === itemSpaceUuid;
            const spaceName = spaces?.find(
                (sp) => sp.uuid === itemSpaceUuid,
            )?.name;
            const subLabel = (
                <SpaceLabel disabled={disabled}>
                    <Icon size={12} icon="folder-close" />
                    {spaceName}
                </SpaceLabel>
            );
            return {
                value: itemUuid,
                label: name,
                disabled: disabled,
                title: disabled
                    ? `${getResourceTypeLabel(
                          resourceType,
                      )} already added on this space ${spaceName}`
                    : '',
                subLabel: subLabel,
            };
        },
    );

    return (
        <Dialog
            isOpen={isOpen}
            onClose={closeModal}
            lazy
            title={`Add ${resourceType} to '${space?.name}' space`}
            canOutsideClickClose={false}
        >
            <Form
                name="add_items_to_space"
                methods={methods}
                onSubmit={handleSubmit}
            >
                <div className={Classes.DIALOG_BODY}>
                    <p>
                        Select the {resourceType}s that you would like to move
                        into '{space?.name}'
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
                        <Button onClick={closeModal}>Cancel</Button>
                        <Button
                            intent={Intent.SUCCESS}
                            text={`Move ${resourceType}s`}
                            disabled={isLoading}
                            type="submit"
                        />
                    </div>
                </div>
            </Form>
        </Dialog>
    );
};

export default AddResourceToSpaceModal;
