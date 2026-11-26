import {
    assertUnreachable,
    DbtProjectType,
    FeatureFlags,
    type Project,
    type SemanticLayerStatus,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Button,
    Group,
    Paper,
    Skeleton,
    Stack,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconArrowRight, IconFileSpreadsheet } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../components/common/MantineIcon';
import { WarehouseTypeLabels } from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import useIsEmbedded from '../../ee/providers/Embed/useIsEmbedded';
import { useProject } from '../../hooks/useProject';
import { useServerFeatureFlag } from '../../hooks/useServerOrClientFeatureFlag';
import {
    getLiveSourceIconClass,
    isAvailableLiveSource,
    LIVE_SOURCE_CATALOG,
} from '../externalConnections/liveSources/liveSourceCatalog';
import { TableListingFailureNotice } from '../sqlRunner/components/TableListingFailureNotice';
import classes from './EmptyProject.module.css';
import sharedClasses from './shared.module.css';
import { describeBlocker, deploysWithCli } from './studioBlocker';
import { StudioDraftIllustration } from './StudioDraftIllustration';
import { useAddSource, WAREHOUSE_OPTION } from './useAddSource';
import { useSemanticLayerStatus } from './useSemanticLayerModel';
import { type ViewModel } from './useSemanticStudio';
import { WarehouseHeading } from './WarehouseStatusLine';
import {
    modelTablePrompt,
    useWarehouseSummary,
    warehouseDetails,
} from './warehouseSummary';

// ---------------------------------------------------------------------------
// Empty project

const STARTER_MODEL = [
    { key: 'type:', value: 'model', indent: 0 },
    { key: 'name:', value: 'your_table', indent: 0 },
    { key: 'metrics:', value: null, indent: 0 },
    { key: 'total_revenue:', value: null, indent: 1 },
    { key: 'type:', value: 'sum', indent: 2 },
];

const StarterModelCode: FC = () => (
    <Box className={classes.starterWindow} aria-hidden>
        <Group gap={5} className={classes.starterBar}>
            <Box className={classes.starterDot} />
            <Box className={classes.starterDot} />
            <Box className={classes.starterDot} />
        </Group>
        <Box className={classes.starterCode}>
            {STARTER_MODEL.map(({ key, value, indent }, index) => (
                <Box
                    key={`${key}${index}`}
                    className={classes.starterLine}
                    pl={indent * 14}
                >
                    <Text span inherit className={classes.starterKey}>
                        {key}
                    </Text>{' '}
                    {value}
                    {index === STARTER_MODEL.length - 1 ? (
                        <Box
                            component="span"
                            className={classes.starterCursor}
                        />
                    ) : null}
                </Box>
            ))}
        </Box>
    </Box>
);

const WAREHOUSE_LOGOS = WarehouseTypeLabels.flatMap((warehouse) =>
    warehouse.iconType === 'image'
        ? [{ label: warehouse.label, image: warehouse.image }]
        : [],
);

const LIVE_SOURCE_ICONS = LIVE_SOURCE_CATALOG.filter(isAvailableLiveSource).map(
    ({ label, icon }) => ({ label, icon }),
);

const LIVE_ICONS_SHOWN = 3;

/** Every supported warehouse as a tile on a faint isometric floor. */
const WarehouseFloor: FC = () => (
    <Box className={classes.isoStage} aria-hidden>
        <Box className={classes.isoPlane}>
            {WAREHOUSE_LOGOS.map(({ label, image }) => (
                <Box key={label} className={classes.isoTile}>
                    <img src={image} alt="" />
                </Box>
            ))}
        </Box>
    </Box>
);

const AltOption: FC<{
    icon: ReactNode;
    title: string;
    description: string;
    onClick: () => void;
}> = ({ icon, title, description, onClick }) => (
    <Box
        component="button"
        type="button"
        className={classes.altOption}
        onClick={onClick}
    >
        <Box className={classes.altIcon} aria-hidden>
            {icon}
        </Box>
        <Text fz="sm" fw={500}>
            {title}
        </Text>
        <Text fz="xs" c="dimmed">
            {description}
        </Text>
    </Box>
);

/** Ways in that need no warehouse: live data sources and files. */
const StartWithoutWarehouse: FC<{ view: ViewModel }> = ({ view }) => {
    const { options, addInPlace } = useAddSource(view);
    const live = options.find(({ key }) => key === 'live');
    const file = options.find(({ key }) => key === 'file');
    if (!live && !file) return null;
    return (
        <Stack gap="xs" w="100%" mt="lg" align="center">
            <Text fz="xs" c="dimmed">
                Or start without one
            </Text>
            <Box className={classes.altOptions}>
                {live ? (
                    <AltOption
                        icon={
                            <Box className={classes.liveIcons}>
                                {LIVE_SOURCE_ICONS.slice(
                                    0,
                                    LIVE_ICONS_SHOWN,
                                ).map(({ label, icon }) => (
                                    <Box
                                        key={label}
                                        className={classes.liveIcon}
                                    >
                                        <img
                                            src={icon}
                                            alt=""
                                            className={getLiveSourceIconClass(
                                                icon,
                                            )}
                                        />
                                    </Box>
                                ))}
                            </Box>
                        }
                        title="Connect a live source"
                        description="PostHog, HubSpot and more"
                        onClick={() => addInPlace(live)}
                    />
                ) : null}
                {file ? (
                    <AltOption
                        icon={
                            <MantineIcon icon={IconFileSpreadsheet} size={18} />
                        }
                        title="Upload a file"
                        description="A CSV or a spreadsheet"
                        onClick={() => addInPlace(file)}
                    />
                ) : null}
            </Box>
        </Stack>
    );
};

/** Other ways in, for anyone who would rather not start from the warehouse. */
const StartFromSources: FC<{ view: ViewModel }> = ({ view }) => {
    const { options, pathOf, addInPlace } = useAddSource(view);
    const others = options.filter(({ key }) => key !== WAREHOUSE_OPTION);
    if (others.length === 0) return null;
    return (
        <Stack gap={6} align="center">
            <Text fz="xs" c="dimmed">
                Or start from
            </Text>
            <Group gap="xs" justify="center">
                {others.map((option) => {
                    const path = pathOf(option);
                    const button = {
                        size: 'xs',
                        variant: 'default',
                        leftSection: option.icon,
                        children: option.label,
                    } as const;
                    return (
                        <Tooltip key={option.key} label={option.description}>
                            {path ? (
                                <Button
                                    {...button}
                                    component={Link}
                                    to={path}
                                />
                            ) : (
                                <Button
                                    {...button}
                                    onClick={() => addInPlace(option)}
                                />
                            )}
                        </Tooltip>
                    );
                })}
            </Group>
        </Stack>
    );
};

const StartFromLiveSource: FC<{ view: ViewModel }> = ({ view }) => {
    const { options, addInPlace } = useAddSource(view, 'live');
    const [live] = options;
    if (!live) return null;
    return (
        <Button
            size="xs"
            variant="subtle"
            color="gray"
            className={sharedClasses.pressable}
            leftSection={live.icon}
            onClick={() => addInPlace(live)}
        >
            Or start from a live data source
        </Button>
    );
};

const SEMANTIC_LAYER_LINE =
    'A semantic layer defines your tables and metrics once, so every chart, dashboard and answer calculates them the same way.';

const CARD_TABLES = 3;

/** What the warehouse holds; each table starts the chat when onModel is given, otherwise the card is read-only. */
const WarehouseCard: FC<{
    projectUuid: string;
    onModel: ((prompt: string) => void) | null;
}> = ({ projectUuid, onModel }) => {
    const { type, summary, listingFailure } = useWarehouseSummary(projectUuid);
    if (!type) return null;
    const tables = summary?.tables.slice(0, CARD_TABLES) ?? [];
    const showsSchema = summary?.location?.includes('.') !== true;
    return (
        <Paper p="md" w="100%" ta="left" aria-label="Warehouse">
            <WarehouseHeading type={type} details={warehouseDetails(summary)} />
            {listingFailure ? (
                <Box mt="xs">
                    <TableListingFailureNotice failure={listingFailure} />
                </Box>
            ) : null}
            {tables.length > 0 ? (
                <Stack gap={0} mt="xs">
                    {tables.map((table) => (
                        <Group
                            key={table.reference}
                            justify="space-between"
                            wrap="nowrap"
                            className={classes.tableRow}
                        >
                            <Text fz="sm" truncate>
                                {table.name}
                                {showsSchema ? (
                                    <Text span inherit c="dimmed">
                                        {` in ${table.schema}`}
                                    </Text>
                                ) : null}
                            </Text>
                            {onModel ? (
                                <Button
                                    size="xs"
                                    variant="subtle"
                                    flex="0 0 auto"
                                    aria-label={`Model ${table.name}`}
                                    onClick={() =>
                                        onModel(modelTablePrompt(table))
                                    }
                                >
                                    Model this
                                </Button>
                            ) : null}
                        </Group>
                    ))}
                </Stack>
            ) : null}
        </Paper>
    );
};

/** Code as a second way in, for those who can deploy. */
const CliLine: FC = () => {
    const isEmbedded = useIsEmbedded();
    return (
        <Text fz="xs" c="dimmed">
            Prefer code? Define models in YAML and deploy with{' '}
            {isEmbedded ? (
                'the CLI'
            ) : (
                <Anchor
                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy"
                    target="_blank"
                    inherit
                >
                    the CLI
                </Anchor>
            )}
            .
        </Text>
    );
};

const EmptyProjectSkeleton: FC = () => (
    <Box className={classes.starter} aria-busy="true" aria-label="Loading">
        <Stack align="center" gap="lg" w="100%" maw={520}>
            <Skeleton h={22} w={240} />
            <Skeleton h={12} w="80%" />
            <Skeleton h={44} radius="md" />
            <Skeleton h={160} radius="md" />
        </Stack>
    </Box>
);

export const BuildFirstModel: FC<{
    view: ViewModel;
    /** Left out while the chat is already open beside this. */
    onAsk: ((prompt: string) => void) | null;
    /** The chat's own composer, left out with onAsk. */
    firstRequest: ReactNode;
}> = ({ view, onAsk, firstRequest }) => {
    const { isListing, summary } = useWarehouseSummary(view.project.id);
    // The rail's card lists the tables; this one only explains why there are none
    const showsWarehouse = !isListing && !summary?.tables.length;
    return (
        <Box className={classes.starter}>
            <Stack align="center" gap="lg" w="100%" maw={640}>
                <StudioDraftIllustration width={180} />
                <Stack gap="xs" align="center" ta="center" maw={480}>
                    <Title order={3}>Build your semantic layer</Title>
                    <Text c="dimmed" fz="sm">
                        {SEMANTIC_LAYER_LINE}
                    </Text>
                </Stack>
                {firstRequest}
                {showsWarehouse ? (
                    <Box w="100%" maw={520}>
                        <WarehouseCard
                            projectUuid={view.project.id}
                            onModel={onAsk}
                        />
                    </Box>
                ) : null}
                <StartFromLiveSource view={view} />
            </Stack>
        </Box>
    );
};

type EmptyState =
    | 'loading'
    | 'noWarehouse'
    | 'connectedProject'
    | 'editingOff'
    | 'cannotEdit'
    | 'noChat';

/** Which starting screen applies, checked in order; the chat screen is chosen before this one renders. */
const getEmptyState = ({
    project,
    isFlagLoading,
    isEditingOn,
    status,
    isLoadingAgents,
}: {
    project: Project | undefined;
    isFlagLoading: boolean;
    isEditingOn: boolean;
    status: SemanticLayerStatus | undefined;
    isLoadingAgents: boolean;
}): EmptyState => {
    if (!project) return 'loading';
    if (!project.warehouseConnection) return 'noWarehouse';
    if (project.dbtConnection.type !== DbtProjectType.NONE)
        return 'connectedProject';
    if (isFlagLoading) return 'loading';
    if (!isEditingOn) return 'editingOff';
    if (!status) return 'loading';
    if (!status.enabled) return 'cannotEdit';
    if (isLoadingAgents) return 'loading';
    return 'noChat';
};

const NO_ROLE_COPY =
    'Building the semantic layer needs the Developer or Admin role on this project. Ask a project admin.';

export const EmptyProject: FC<{
    view: ViewModel;
    isLoadingAgents: boolean;
    /** Why the chat is missing for someone who can edit; null when nothing refused it. */
    chatRefusal: string | null;
}> = ({ view, isLoadingAgents, chatRefusal }) => {
    const { options, pathOf } = useAddSource(view);
    const { data: project } = useProject(view.project.id);
    const flag = useServerFeatureFlag(FeatureFlags.SemanticStudioEditing);
    const status = useSemanticLayerStatus(view.project.id);
    const state = getEmptyState({
        project,
        isFlagLoading: flag.isInitialLoading,
        isEditingOn: flag.data?.enabled === true,
        status,
        isLoadingAgents,
    });
    const connect = options.find(({ key }) => key === WAREHOUSE_OPTION);
    const canDeploy = status !== undefined && deploysWithCli(status.blocker);
    const blocker = status?.blocker ?? null;

    switch (state) {
        case 'loading':
            return <EmptyProjectSkeleton />;
        case 'noWarehouse':
            return (
                <Box className={classes.starter}>
                    <Stack
                        align="center"
                        gap="lg"
                        w="100%"
                        maw={460}
                        ta="center"
                    >
                        <WarehouseFloor />
                        <Stack gap="xs" align="center">
                            <Title order={3}>
                                Connect a warehouse to start
                            </Title>
                            <Text c="dimmed" fz="sm">
                                {`Your tables and metrics are built from the data in your warehouse. ${connect ? 'Add its credentials in project settings.' : 'Ask a project admin to connect one.'}`}
                            </Text>
                        </Stack>
                        {connect ? (
                            <Button
                                component={Link}
                                to={pathOf(connect) ?? ''}
                                rightSection={
                                    <MantineIcon
                                        icon={IconArrowRight}
                                        size={16}
                                    />
                                }
                            >
                                Connect a warehouse
                            </Button>
                        ) : null}
                        <StartWithoutWarehouse view={view} />
                    </Stack>
                </Box>
            );
        case 'connectedProject':
            return (
                <Box className={classes.starter}>
                    <Stack
                        align="center"
                        gap="xl"
                        w="100%"
                        maw={460}
                        ta="center"
                    >
                        <StarterModelCode />
                        <Stack gap="xs" align="center">
                            <Title order={3}>No models yet</Title>
                            <Text c="dimmed" fz="sm">
                                Your tables and metrics come from the connected
                                project. They show up here after it refreshes.
                            </Text>
                        </Stack>
                        <StartFromSources view={view} />
                    </Stack>
                </Box>
            );
        case 'editingOff':
        case 'cannotEdit':
        case 'noChat':
            return (
                <Box className={classes.starter}>
                    <Stack align="center" gap="lg" w="100%" maw={520}>
                        <Stack gap="xs" align="center" ta="center" maw={480}>
                            <Title order={3}>Build your semantic layer</Title>
                            <Text c="dimmed" fz="sm">
                                {state === 'editingOff'
                                    ? "Semantic layer editing isn't turned on for this organization."
                                    : state === 'cannotEdit' && blocker
                                      ? blocker === 'no_access'
                                          ? NO_ROLE_COPY
                                          : describeBlocker(blocker)
                                      : (chatRefusal ?? SEMANTIC_LAYER_LINE)}
                            </Text>
                        </Stack>
                        <WarehouseCard
                            projectUuid={view.project.id}
                            onModel={null}
                        />
                        <StartFromSources view={view} />
                        {state !== 'editingOff' && canDeploy ? (
                            <CliLine />
                        ) : null}
                    </Stack>
                </Box>
            );
        default:
            return assertUnreachable(state, 'Unknown empty state');
    }
};
