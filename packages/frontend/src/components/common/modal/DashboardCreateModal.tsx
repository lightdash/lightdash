import { Dashboard, Space } from '@lightdash/common';
import {
    ActionIcon,
    Button,
    Group,
    MantineProvider,
    Modal,
    ModalProps,
    Select,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFolder, IconX } from '@tabler/icons-react';
import { FC, useCallback, useEffect, useState } from 'react';
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

    const [searchValue, onSearchChange] = useState('');
    const [spacesOptions, setSpacesOptions] = useState<
        { value: string; label: string }[]
    >([]);

    const {
        data: spaces,
        isInitialLoading: isLoadingSpaces,
        isSuccess,
    } = useSpaceSummaries(projectUuid, true, {
        staleTime: 0,
        onSuccess: (data) => {
            if (data.length > 0) {
                setSpacesOptions(
                    data.map((space) => ({
                        value: space.uuid,
                        label: space.name,
                    })),
                );
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

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    const { setFieldValue } = form;

    useEffect(() => {
        if (isSuccess && modalProps.opened) {
            setFieldValue(
                'spaceUuid',
                spaces?.find((space) => space.uuid === defaultSpaceUuid)
                    ?.uuid ??
                    ((spaces && spaces[0].uuid) || ''),
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
                        {!isLoadingSpaces && spaces ? (
                            <Stack spacing="xs">
                                <Select
                                    searchable
                                    creatable
                                    clearable
                                    withinPortal
                                    label={
                                        form.values.isCreatingNewSpace
                                            ? 'Moving to new space'
                                            : 'Select a space'
                                    }
                                    data={spacesOptions}
                                    icon={<MantineIcon icon={IconFolder} />}
                                    required
                                    clearButtonProps={{
                                        onClick: () => {
                                            onSearchChange('');
                                            setFieldValue(
                                                'isCreatingNewSpace',
                                                false,
                                            );
                                            setFieldValue('newSpaceName', '');
                                        },
                                    }}
                                    onSearchChange={(query) => {
                                        if (!query) {
                                            setFieldValue(
                                                'isCreatingNewSpace',
                                                false,
                                            );
                                            setFieldValue('newSpaceName', '');
                                        }
                                        onSearchChange(query);
                                    }}
                                    searchValue={searchValue}
                                    placeholder="Select space"
                                    getCreateLabel={(query) => (
                                        <Text component="b">
                                            + Create new space{' '}
                                            <Text span color="blue">
                                                {query}
                                            </Text>
                                        </Text>
                                    )}
                                    readOnly={form.values.isCreatingNewSpace}
                                    rightSection={
                                        form.values.isCreatingNewSpace ||
                                        !!form.values.spaceUuid ? (
                                            <ActionIcon
                                                variant="transparent"
                                                onClick={() => {
                                                    setSpacesOptions((prev) =>
                                                        prev.filter(
                                                            ({ label }) =>
                                                                label !==
                                                                searchValue,
                                                        ),
                                                    );

                                                    onSearchChange('');
                                                    setFieldValue(
                                                        'isCreatingNewSpace',
                                                        false,
                                                    );
                                                    setFieldValue(
                                                        'newSpaceName',
                                                        '',
                                                    );
                                                    setFieldValue(
                                                        'spaceUuid',
                                                        '',
                                                    );
                                                }}
                                            >
                                                <MantineIcon icon={IconX} />
                                            </ActionIcon>
                                        ) : null
                                    }
                                    onCreate={(query) => {
                                        const item = {
                                            value: query,
                                            label: query,
                                        };

                                        form.setFieldValue(
                                            'isCreatingNewSpace',
                                            true,
                                        );
                                        form.setFieldValue(
                                            'newSpaceName',
                                            query,
                                        );

                                        spacesOptions.push(item);

                                        return item;
                                    }}
                                    {...form.getInputProps('spaceUuid')}
                                />
                            </Stack>
                        ) : null}
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
