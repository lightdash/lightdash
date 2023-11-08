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

    const [spaceUuid, setSpaceUuid] = useState<string | null>();
    const [name, setName] = useState('');
    const [description, setDescription] = useState<string>();
    const [newSpaceName, setNewSpaceName] = useState('');
    const [shouldCreateNewSpace, setShouldCreateNewSpace] = useState(false);

    const { data: spaces, isLoading: isLoadingSpaces } = useSpaceSummaries(
        projectUuid,
        true,
        {
            staleTime: 0,
            onSuccess: (data) => {
                if (data.length > 0) {
                    const currentSpace = defaultSpaceUuid
                        ? data.find((space) => space.uuid === defaultSpaceUuid)
                        : data[0];
                    setSpaceUuid(currentSpace?.uuid);
                } else {
                    setShouldCreateNewSpace(true);
                }
            },
        },
    );
    const showSpaceInput = shouldCreateNewSpace || spaces?.length === 0;

    const handleClose = useCallback(() => {
        setName('');
        setDescription('');
        setNewSpaceName('');
        setSpaceUuid(undefined);
        setShouldCreateNewSpace(false);
        onClose?.();
    }, [onClose]);

    const handleConfirm = useCallback(async () => {
        let newSpace = showSpaceInput
            ? await createSpaceAsync({
                  name: newSpaceName,
                  access: [],
                  isPrivate: true,
              })
            : undefined;

        const savedQuery = await mutateAsync({
            ...savedData,
            name,
            description,
            spaceUuid: newSpace?.uuid || spaceUuid || undefined,
        });

        setName('');
        setDescription('');
        setNewSpaceName('');
        setSpaceUuid(undefined);
        setShouldCreateNewSpace(false);
        onConfirm(savedQuery);
        return savedQuery;
    }, [
        name,
        description,
        savedData,
        spaceUuid,
        newSpaceName,
        createSpaceAsync,
        mutateAsync,
        showSpaceInput,
        onConfirm,
    ]);

    const handleSaveChartInDashboard = useCallback(async () => {
        if (!fromDashboard || !unsavedDashboardTiles || !dashboardUuid) return;
        const newChartInDashboard: CreateChartInDashboard = {
            ...savedData,
            name,
            description,
            dashboardUuid,
        };
        const newTile: CreateDashboardChartTile = {
            uuid: uuid4(),
            type: DashboardTileTypes.SAVED_CHART,
            properties: {
                belongsToDashboard: true,
                savedChartUuid: (await mutateAsync(newChartInDashboard)).uuid,
                chartName: newChartInDashboard.name,
            },
            ...getDefaultChartTileSize(savedData.chartConfig?.type),
        };
        sessionStorage.setItem(
            'unsavedDashboardTiles',
            JSON.stringify(
                appendNewTilesToBottom(unsavedDashboardTiles ?? [], [newTile]),
            ),
        );
        sessionStorage.removeItem('fromDashboard');
        sessionStorage.removeItem('dashboardUuid');
        history.push(
            `/projects/${projectUuid}/dashboards/${dashboardUuid}/edit`,
        );
        showToastSuccess({
            title: `Success! ${name} was added to ${fromDashboard}`,
        });
    }, [
        fromDashboard,
        unsavedDashboardTiles,
        dashboardUuid,
        mutateAsync,
        savedData,
        name,
        description,
        history,
        projectUuid,
        showToastSuccess,
    ]);

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
            <Stack p="md">
                <TextInput
                    label="Enter a memorable name for your chart"
                    placeholder="eg. How many weekly active users do we have?"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    data-testid="ChartCreateModal/NameInput"
                />
                <TextInput
                    label="Chart description"
                    placeholder="A few words to give your team some context"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
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
                            value={spaceUuid}
                            withinPortal
                            onChange={(id) => setSpaceUuid(id)}
                            data={spaces?.map((space) => ({
                                value: space.uuid,
                                label: space.name,
                            }))}
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
                        value={newSpaceName}
                        onChange={(e) => setNewSpaceName(e.target.value)}
                        placeholder="eg. KPIs"
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
                <Button onClick={handleClose} variant="outline">
                    Cancel
                </Button>

                <Button
                    onClick={
                        fromDashboard && dashboardUuid
                            ? handleSaveChartInDashboard
                            : handleConfirm
                    }
                    disabled={
                        isCreating ||
                        isCreatingSpace ||
                        !name ||
                        (!fromDashboard && showSpaceInput && !newSpaceName)
                    }
                >
                    Save
                </Button>
            </Group>
        </Modal>
    );
};

export default ChartCreateModal;
