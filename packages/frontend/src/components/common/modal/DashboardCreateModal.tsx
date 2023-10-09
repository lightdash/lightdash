import { Dashboard, Space } from '@lightdash/common';
import {
    Button,
    Group,
    MantineProvider,
    Modal,
    ModalProps,
    Select,
    Stack,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconArrowLeft, IconFolder, IconPlus } from '@tabler/icons-react';
import { FC, useCallback, useEffect } from 'react';
import { useCreateMutation } from '../../../hooks/dashboard/useDashboard';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import { useApp } from '../../../providers/AppProvider';
import MantineIcon from '../MantineIcon';

interface DashboardCreateModalProps extends ModalProps {
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

    const form = useForm({
        initialValues: {
            isCreatingNewSpace: false,
            dashboardName: '',
            dashboardDescription: '',
            spaceUuid: '',
            newSpaceName: '',
        },
    });

    const {
        data: spaces,
        isLoading: isLoadingSpaces,
        isSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        onSuccess: (data) => {
            if (data.length > 0) {
                const currentSpace = defaultSpaceUuid
                    ? data.find((space) => space.uuid === defaultSpaceUuid)
                    : data[0];
                return currentSpace?.uuid
                    ? form.setFieldValue('spaceUuid', currentSpace?.uuid)
                    : null;
            } else {
                form.setFieldValue('setIsCreatingNewSpace', true);
            }
        },
    });

    const showNewSpaceInput =
        form.values.isCreatingNewSpace || spaces?.length === 0;

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    const { setFieldValue } = form;

    useEffect(() => {
        if (isSuccess && modalProps.opened) {
            setFieldValue(
                'spaceUuid',
                spaces.find((space) => space.uuid === defaultSpaceUuid)?.uuid ??
                    spaces[0].uuid ??
                    '',
            );
        }
    }, [defaultSpaceUuid, isSuccess, modalProps.opened, setFieldValue, spaces]);

    const handleConfirm = useCallback(
        async (data: typeof form.values) => {
            let newSpace: Space | undefined;

            if (form.values.isCreatingNewSpace) {
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
        [createDashboard, createSpace, onConfirm, form],
    );

    if (user.data?.ability?.cannot('manage', 'Dashboard')) return null;

    if (isLoadingSpaces || !spaces) return null;

    return (
        <MantineProvider inherit theme={{ colorScheme: 'light' }}>
            <Modal
                title={<Title order={5}>Create dashboard</Title>}
                onClose={() => handleClose()}
                {...modalProps}
            >
                <form
                    title="Create Dashboard"
                    onSubmit={form.onSubmit((values) => handleConfirm(values))}
                >
                    <Stack mb="sm">
                        <TextInput
                            label="Name your dashboard"
                            placeholder="eg. KPI Dashboard"
                            disabled={isCreatingDashboard}
                            required
                            {...form.getInputProps('dashboardName')}
                        />
                        <TextInput
                            label="Dashboard description"
                            placeholder="A few words to give your team some context"
                            disabled={isCreatingDashboard}
                            {...form.getInputProps('dashboardDescription')}
                        />
                        {!isLoadingSpaces && spaces && !showNewSpaceInput ? (
                            <Stack spacing="xs">
                                <Select
                                    withinPortal
                                    label="Select a space"
                                    data={spaces?.map((space) => ({
                                        value: space.uuid,
                                        label: space.name,
                                    }))}
                                    icon={<MantineIcon icon={IconFolder} />}
                                    required
                                    placeholder="Select space"
                                    nothingFound="Nothing found"
                                    {...form.getInputProps('spaceUuid')}
                                />
                                <Button
                                    leftIcon={<MantineIcon icon={IconPlus} />}
                                    variant="subtle"
                                    mr="auto"
                                    size="xs"
                                    onClick={() =>
                                        form.setFieldValue(
                                            'isCreatingNewSpace',
                                            true,
                                        )
                                    }
                                >
                                    Create new space
                                </Button>
                            </Stack>
                        ) : (
                            <Stack spacing="xs">
                                <TextInput
                                    icon={<MantineIcon icon={IconFolder} />}
                                    label="Name your space"
                                    placeholder="eg. KPIs"
                                    required
                                    {...form.getInputProps('newSpaceName')}
                                />
                                <Button
                                    leftIcon={
                                        <MantineIcon icon={IconArrowLeft} />
                                    }
                                    onClick={() =>
                                        form.setFieldValue(
                                            'isCreatingNewSpace',
                                            false,
                                        )
                                    }
                                    variant="subtle"
                                    color="gray"
                                    mr="auto"
                                    size="xs"
                                >
                                    Save to existing space instead
                                </Button>
                            </Stack>
                        )}
                    </Stack>

                    <Group position="right">
                        <Button
                            size="sm"
                            variant="outline"
                            color="gray"
                            onClick={handleClose}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            disabled={!form.isValid}
                            loading={isCreatingDashboard || isCreatingSpace}
                            type="submit"
                        >
                            Create
                        </Button>
                    </Group>
                </form>
            </Modal>
        </MantineProvider>
    );
};

export default DashboardCreateModal;
