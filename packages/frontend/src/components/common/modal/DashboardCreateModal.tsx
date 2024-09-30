import { subject } from '@casl/ability';
import { type Dashboard, type Space } from '@lightdash/common';
import {
    ActionIcon,
    Box,
    Button,
    Group,
    MantineProvider,
    Modal,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconFolder, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useState, type FC } from 'react';
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
    const { user } = useApp();
    const { mutateAsync: createDashboard, isLoading: isCreatingDashboard } =
        useCreateMutation(projectUuid);
    const { mutateAsync: createSpace, isLoading: isCreatingSpace } =
        useSpaceCreateMutation(projectUuid);

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
        select: (data) => {
            // Only get spaces that the user can create dashboards to
            return data.filter((space) =>
                user.data?.ability.can(
                    'create',
                    subject('Dashboard', {
                        ...space,
                        access: space.userAccess ? [space.userAccess] : [],
                    }),
                ),
            );
        },
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
                tabs: [], // add default tab
            });
            onConfirm?.(dashboard);
            form.reset();
        },
        [createDashboard, createSpace, onConfirm, form],
    );

    if (isLoadingSpaces || !spaces) return null;

    return (
        <MantineProvider inherit theme={{ colorScheme: 'light' }}>
            <Modal
                title={
                    <Box>
                        <Title order={4}>Create Dashboard</Title>
                    </Box>
                }
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
                        <Textarea
                            label="Dashboard description"
                            placeholder="A few words to give your team some context"
                            disabled={isCreatingDashboard}
                            autosize
                            maxRows={3}
                            {...form.getInputProps('dashboardDescription')}
                        />
                        {!isLoadingSpaces && spaces ? (
                            <Stack spacing="xs">
                                <Select
                                    searchable
                                    creatable={user.data?.ability.can(
                                        'create',
                                        subject('Space', {
                                            organizationUuid:
                                                user.data?.organizationUuid,
                                            projectUuid,
                                        }),
                                    )}
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
