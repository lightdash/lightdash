import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
    FormGroup,
    HTMLSelect,
    InputGroup,
    Intent,
} from '@blueprintjs/core';
import { Dashboard, Space } from '@lightdash/common';
import { FC, useCallback, useState } from 'react';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import {} from '../ShareSpaceModal/ShareSpaceModal.style';

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

    const [dashboardName, setDashboardName] = useState<string>('');
    const [dashboardDescription, setDashboardDescription] =
        useState<string>('');

    const [spaceUuid, setSpaceUuid] = useState<string>();
    const [isCreatingNewSpace, setIsCreatingnewSpace] =
        useState<boolean>(false);
    const [newSpaceName, setNewSpaceName] = useState('');

    const { data: spaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        false,
        {
            onSuccess: (data) => {
                if (data.length > 0) {
                    const currentSpace = defaultSpaceUuid
                        ? data.find((space) => space.uuid === defaultSpaceUuid)
                        : data[0];
                    setSpaceUuid(currentSpace?.uuid);
                } else {
                    setIsCreatingnewSpace(true);
                }
            },
        },
    );
    const showNewSpaceInput = isCreatingNewSpace || spaces?.length === 0;

    const handleReset = () => {
        setDashboardName('');
        setDashboardDescription('');
        setNewSpaceName('');
        setIsCreatingnewSpace(false);
    };
    const handleClose: DashboardCreateModalProps['onClose'] = (event) => {
        handleReset();
        onClose?.(event);
    };

    const handleConfirm = useCallback(async () => {
        let newSpace: Space | undefined;

        if (isCreatingNewSpace) {
            newSpace = await createSpace({
                name: newSpaceName,
                isPrivate: false,
                access: [],
            });
        }

        const dashboard = await createDashboard({
            name: dashboardName,
            description: dashboardDescription,
            spaceUuid: newSpace?.uuid || spaceUuid,
            tiles: [],
        });
        onConfirm?.(dashboard);
        handleReset();
    }, [
        createDashboard,
        createSpace,
        spaceUuid,
        dashboardName,
        newSpaceName,
        isCreatingNewSpace,
        dashboardDescription,
        onConfirm,
    ]);

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
            <DialogBody>
                <FormGroup label="Name your dashboard" labelFor="chart-name">
                    <InputGroup
                        id="chart-name"
                        type="text"
                        value={dashboardName}
                        onChange={(e) => setDashboardName(e.target.value)}
                        placeholder="eg. KPI dashboard"
                    />
                </FormGroup>
                <FormGroup
                    label="Dashboard description"
                    labelFor="chart-description"
                >
                    <InputGroup
                        id="chart-description"
                        type="text"
                        value={dashboardDescription}
                        onChange={(e) =>
                            setDashboardDescription(e.target.value)
                        }
                        placeholder="A few words to give your team some context"
                    />
                </FormGroup>
                {!isLoadingSpaces && !showNewSpaceInput ? (
                    <>
                        <FormGroup
                            label="Select a space"
                            labelFor="select-space"
                        >
                            <HTMLSelect
                                id="select-space"
                                fill={true}
                                value={spaceUuid}
                                onChange={(e) =>
                                    setSpaceUuid(e.currentTarget.value)
                                }
                                options={spaces?.map((space) => ({
                                    value: space.uuid,
                                    label: space.name,
                                }))}
                            />
                        </FormGroup>
                        <Button
                            minimal
                            icon="plus"
                            intent="primary"
                            onClick={() => setIsCreatingnewSpace(true)}
                        >
                            Create new space
                        </Button>
                    </>
                ) : (
                    <>
                        <FormGroup
                            label="Name your space"
                            labelFor="dashboard-space"
                        >
                            <InputGroup
                                id="dashboard-space"
                                type="text"
                                value={newSpaceName}
                                onChange={(e) =>
                                    setNewSpaceName(e.target.value)
                                }
                                placeholder="eg. KPIs"
                            />
                        </FormGroup>
                        <Button
                            minimal
                            icon="arrow-left"
                            intent="primary"
                            onClick={() => setIsCreatingnewSpace(false)}
                        >
                            Save to existing space
                        </Button>
                    </>
                )}
            </DialogBody>

            <DialogFooter
                actions={
                    <>
                        <Button
                            onClick={(e) => {
                                handleClose(e);
                                if (onClose) onClose(e);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            intent={Intent.PRIMARY}
                            text="Create"
                            type="submit"
                            loading={isCreatingDashboard || isCreatingSpace}
                            onClick={handleConfirm}
                            disabled={
                                (isCreatingDashboard && dashboardName === '') ||
                                (isCreatingNewSpace && newSpaceName === '')
                            }
                        />
                    </>
                }
            />
        </Dialog>
    );
};

export default DashboardCreateModal;
