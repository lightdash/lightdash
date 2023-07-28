import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
} from '@blueprintjs/core';
import { Dashboard, Space } from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import Form from '../../ReactHookForm/Form';
import Input from '../../ReactHookForm/Input';
import Select from '../../ReactHookForm/Select';

interface DashboardCreateModalProps extends DialogProps {
    projectUuid: string;
    defaultSpaceUuid?: string;
    onConfirm?: (dashboard: Dashboard) => void;
}

const DashboardCreateModal: FC<DashboardCreateModalProps> = ({
    projectUuid,
    defaultSpaceUuid,
    onConfirm,
    onClose,
    ...modalProps
}) => {
    const { mutateAsync: createDashboard, isLoading: isCreatingDashboard } =
        useCreateMutation(projectUuid);
    const { mutateAsync: createSpace, isLoading: isCreatingSpace } =
        useSpaceCreateMutation(projectUuid);
    const { user } = useApp();
    const [isCreatingNewSpace, setIsCreatingNewSpace] = useState(false);

    const form = useForm({
        mode: 'onChange',
        defaultValues: {
            dashboardName: '',
            dashboardDescription: '',
            spaceUuid: '',
            newSpaceName: '',
        },
    });

    const { data: spaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        false,
        {
            onSuccess: (data) => {
                if (data.length > 0) {
                    const currentSpace = defaultSpaceUuid
                        ? data.find((space) => space.uuid === defaultSpaceUuid)
                        : data[0];
                    return currentSpace?.uuid
                        ? form.setValue('spaceUuid', currentSpace?.uuid)
                        : null;
                } else {
                    setIsCreatingNewSpace(true);
                }
            },
        },
    );
    const showNewSpaceInput = isCreatingNewSpace || spaces?.length === 0;

    const handleClose: DashboardCreateModalProps['onClose'] = (event) => {
        form.reset();
        onClose?.(event);
    };

    const handleConfirm = useCallback(
        async (data) => {
            let newSpace: Space | undefined;

            if (isCreatingNewSpace) {
                newSpace = await createSpace({
                    name: data.newSpaceName,
                    isPrivate: false,
                    access: [],
                });
            }

            const dashboard = await createDashboard({
                name: data.dashboardName,
                description: data.dashboardDescription,
                spaceUuid: newSpace?.uuid || data.spaceUuid,
                tiles: [],
            });
            onConfirm?.(dashboard);
            form.reset();
        },
        [createDashboard, createSpace, onConfirm, form, isCreatingNewSpace],
    );

    if (user.data?.ability?.cannot('manage', 'Dashboard')) return null;

    if (isLoadingSpaces || !spaces) return null;

    return (
        <Dialog
            lazy
            title="Create dashboard"
            icon="control"
            {...modalProps}
            onClose={handleClose}
        >
            <Form
                title="Create Dashboard"
                methods={form}
                onSubmit={handleConfirm}
            >
                <DialogBody>
                    <Input
                        label="Enter a memorable name for your dashboard"
                        name="dashboardName"
                        placeholder="eg. KPI Dashboards"
                        disabled={isCreatingDashboard}
                        rules={{ required: 'Name field is required' }}
                    />
                    <Input
                        label="Description"
                        name="dashboardDescription"
                        placeholder="A few words to give your team some context"
                        disabled={isCreatingDashboard}
                    />
                    {!isLoadingSpaces && !showNewSpaceInput ? (
                        <>
                            <Select
                                name="spaceUuid"
                                label="Select a space"
                                options={spaces?.map((space) => ({
                                    value: space.uuid,
                                    label: space.name,
                                }))}
                            />
                            <Button
                                minimal
                                icon="plus"
                                intent="primary"
                                onClick={() => setIsCreatingNewSpace(true)}
                            >
                                Create new space
                            </Button>
                        </>
                    ) : (
                        <>
                            <Input
                                label="Name your space"
                                name="newSpaceName"
                                placeholder="eg. KPIs"
                                rules={{ required: 'Name field is required' }}
                            />
                            <Button
                                minimal
                                icon="arrow-left"
                                intent="primary"
                                onClick={() => setIsCreatingNewSpace(false)}
                            >
                                Save to existing space
                            </Button>
                        </>
                    )}
                </DialogBody>
                <DialogFooter
                    actions={
                        <>
                            <Button onClick={() => modalProps.onClosed}>
                                Cancel
                            </Button>
                            <Button
                                disabled={!form.formState.isValid}
                                loading={isCreatingDashboard || isCreatingSpace}
                                intent="primary"
                                type="submit"
                            >
                                Save
                            </Button>
                        </>
                    }
                />
            </Form>
        </Dialog>
    );
};

export default DashboardCreateModal;
