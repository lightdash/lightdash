import {
    CreateChartInDashboard,
    CreateDashboardChartTile,
    CreateSavedChartVersion,
    DashboardTileTypes,
    getDefaultChartTileSize,
} from '@lightdash/common';
import {
    Button,
    Group,
    Input,
    Modal,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { uuid4 } from '@sentry/utils';
import { IconChartBar } from '@tabler/icons-react';
import { FC, useCallback, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { appendNewTilesToBottom } from '../../../hooks/dashboard/useDashboard';
import useToaster from '../../../hooks/toaster/useToaster';
import { useCreateMutation } from '../../../hooks/useSavedQuery';
import {
    useCreateMutation as useSpaceCreateMutation,
    useSpaceSummaries,
} from '../../../hooks/useSpaces';
import MantineIcon from '../MantineIcon';

interface ChartCreateModalProps {
    savedData: CreateSavedChartVersion;
    isOpen: boolean;
    onClose: () => void;
    defaultSpaceUuid?: string;
    onConfirm: (savedData: CreateSavedChartVersion) => void;
}

interface ChartCreateModalFormValues {
    name: string;
    spaceUuid: string;
    description: string;
    newSpaceName: string | null;
}

const ChartCreateModal: FC<ChartCreateModalProps> = ({
    savedData,
    isOpen,
    onClose,
    defaultSpaceUuid,
    onConfirm,
}) => {
    const fromDashboard = sessionStorage.getItem('fromDashboard');
    const dashboardUuid = sessionStorage.getItem('dashboardUuid');
    const unsavedDashboardTiles = JSON.parse(
        sessionStorage.getItem('unsavedDashboardTiles') ?? '[]',
    );
    const { showToastSuccess } = useToaster();
    const history = useHistory();

    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { mutateAsync, isLoading: isCreating } = useCreateMutation();
    const { mutateAsync: createSpaceAsync, isLoading: isCreatingSpace } =
        useSpaceCreateMutation(projectUuid);

    const form = useForm<ChartCreateModalFormValues>({
        initialValues: {
            name: '',
            spaceUuid: '',
            description: '',
            newSpaceName: null,
        },

        validate: {
            name: (value) => {
                return value.length > 0 ? null : 'Name is required';
            },
        },
    });

    const [shouldCreateNewSpace, setShouldCreateNewSpace] = useState(false);

    const { data: spaces, isInitialLoading: isLoadingSpaces } =
        useSpaceSummaries(projectUuid, true, {
            staleTime: 0,
            onSuccess: (data) => {
                if (data.length > 0) {
                    const currentSpace = defaultSpaceUuid
                        ? data.find((space) => space.uuid === defaultSpaceUuid)
                        : data[0];
                    form.setFieldValue('spaceUuid', currentSpace?.uuid || '');
                } else {
                    setShouldCreateNewSpace(true);
                }
            },
        });
    const showSpaceInput = shouldCreateNewSpace || spaces?.length === 0;

    const handleConfirm = useCallback(
        async (values: ChartCreateModalFormValues) => {
            let newSpace =
                showSpaceInput && values.newSpaceName
                    ? await createSpaceAsync({
                          name: values.newSpaceName,
                          access: [],
                          isPrivate: true,
                      })
                    : undefined;

            const savedQuery = await mutateAsync({
                ...savedData,
                name: values.name,
                description: values.description,
                spaceUuid: newSpace?.uuid || values.spaceUuid || undefined,
            });

            setShouldCreateNewSpace(false);
            onConfirm(savedQuery);
            return savedQuery;
        },
        [savedData, createSpaceAsync, mutateAsync, showSpaceInput, onConfirm],
    );

    const handleSaveChartInDashboard = useCallback(
        async (values: ChartCreateModalFormValues) => {
            if (!fromDashboard || !unsavedDashboardTiles || !dashboardUuid)
                return;
            const newChartInDashboard: CreateChartInDashboard = {
                ...savedData,
                name: values.name,
                description: values.description,
                dashboardUuid: dashboardUuid,
            };
            const newTile: CreateDashboardChartTile = {
                uuid: uuid4(),
                type: DashboardTileTypes.SAVED_CHART,
                properties: {
                    belongsToDashboard: true,
                    savedChartUuid: (await mutateAsync(newChartInDashboard))
                        .uuid,
                    chartName: newChartInDashboard.name,
                },
                ...getDefaultChartTileSize(savedData.chartConfig?.type),
            };
            sessionStorage.setItem(
                'unsavedDashboardTiles',
                JSON.stringify(
                    appendNewTilesToBottom(unsavedDashboardTiles ?? [], [
                        newTile,
                    ]),
                ),
            );
            sessionStorage.removeItem('fromDashboard');
            sessionStorage.removeItem('dashboardUuid');
            history.push(
                `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
            );
            showToastSuccess({
                title: `Success! ${values.name} was added to ${fromDashboard}`,
            });
        },
        [
            fromDashboard,
            unsavedDashboardTiles,
            dashboardUuid,
            mutateAsync,
            savedData,
            history,
            projectUuid,
            showToastSuccess,
        ],
    );

    if (isLoadingSpaces || !spaces) return null;

    return (
        <Modal
            opened={isOpen}
            onClose={onClose}
            keepMounted={false}
            title={
                <Group spacing="xs">
                    <MantineIcon icon={IconChartBar} size="lg" color="gray.7" />
                    <Text fw={600}>
                        {fromDashboard
                            ? `Save chart to ${fromDashboard}`
                            : 'Save chart'}
                    </Text>
                </Group>
            }
            styles={(theme) => ({
                header: { borderBottom: `1px solid ${theme.colors.gray[4]}` },
                body: { padding: 0 },
            })}
        >
            <form
                onSubmit={form.onSubmit((values) => {
                    if (fromDashboard && dashboardUuid) {
                        handleSaveChartInDashboard(values);
                    } else {
                        handleConfirm(values);
                    }
                })}
            >
                <Stack p="md">
                    <TextInput
                        label="Enter a memorable name for your chart"
                        placeholder="eg. How many weekly active users do we have?"
                        required
                        {...form.getInputProps('name')}
                        data-testid="ChartCreateModal/NameInput"
                    />
                    <TextInput
                        label="Chart description"
                        placeholder="A few words to give your team some context"
                        {...form.getInputProps('description')}
                    />
                    {fromDashboard && fromDashboard.length > 0 && (
                        <Stack spacing="xxs">
                            <Input.Label>Save to {fromDashboard}</Input.Label>
                            <Text fw={400} color="gray.6">
                                This chart will be saved exclusively to the
                                dashboard "{fromDashboard}", keeping your space
                                clutter-free.
                            </Text>
                        </Stack>
                    )}
                    {!showSpaceInput && !fromDashboard && (
                        <Stack spacing="xxs">
                            <Select
                                label="Select space"
                                withinPortal
                                data={spaces?.map((space) => ({
                                    value: space.uuid,
                                    label: space.name,
                                }))}
                                {...form.getInputProps('spaceUuid')}
                            />
                            <Button
                                variant="subtle"
                                compact
                                onClick={() => setShouldCreateNewSpace(true)}
                                sx={{
                                    alignSelf: 'start',
                                }}
                            >
                                + Create new space
                            </Button>
                        </Stack>
                    )}
                    {showSpaceInput && (
                        <TextInput
                            label="Space"
                            description="Create a new space to add this chart to"
                            placeholder="eg. KPIs"
                            {...form.getInputProps('newSpaceName')}
                        />
                    )}
                </Stack>

                <Group
                    position="right"
                    w="100%"
                    sx={(theme) => ({
                        borderTop: `1px solid ${theme.colors.gray[4]}`,
                        bottom: 0,
                        padding: theme.spacing.md,
                    })}
                >
                    <Button onClick={onClose} variant="outline">
                        Cancel
                    </Button>

                    <Button
                        type="submit"
                        disabled={
                            isCreating ||
                            isCreatingSpace ||
                            !form.values.name ||
                            (!fromDashboard &&
                                showSpaceInput &&
                                !form.values.newSpaceName)
                        }
                    >
                        Save
                    </Button>
                </Group>
            </form>
        </Modal>
    );
};

export default ChartCreateModal;
