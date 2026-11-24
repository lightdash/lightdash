import { DbtProjectType } from '@lightdash/common';
import { Box, Button, Group, Stack, Text, Title, Tooltip } from '@mantine/core';
import { type FC, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
    getWarehouseIcon,
    getWarehouseLabel,
} from '../../components/ProjectConnection/ProjectConnectFlow/utils';
import { WarehouseLogoStack } from '../../components/ProjectConnection/ProjectConnectFlow/WarehouseLogoStack';
import { useAiOrganizationSettings } from '../../ee/features/aiCopilot/hooks/useAiOrganizationSettings';
import { useProject } from '../../hooks/useProject';
import { useTables } from '../sqlRunner/hooks/useTables';
import classes from './EmptyProject.module.css';
import sharedClasses from './shared.module.css';
import { StudioDraftIllustration } from './StudioDraftIllustration';
import { STUDIO_STARTERS } from './studioStarters';
import { getNewAgentUrl } from './urls';
import { useAddSource, WAREHOUSE_OPTION } from './useAddSource';
import { useCanEditSemanticLayer } from './useSemanticLayerModel';
import { type ViewModel } from './useSemanticStudio';

// ---------------------------------------------------------------------------
// Empty project

const STARTER_MODEL = [
    { key: 'type:', value: 'model', indent: 0 },
    { key: 'name:', value: 'your_table', indent: 0 },
    { key: 'metrics:', value: null, indent: 0 },
    { key: 'total_revenue:', value: null, indent: 1 },
    { key: 'type:', value: 'sum', indent: 2 },
];

const StarterModelCode: FC<{ showWarehouses: boolean }> = ({
    showWarehouses,
}) => (
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
        {showWarehouses ? (
            <Box className={classes.starterLogos}>
                <WarehouseLogoStack size="md" monochrome={false} />
            </Box>
        ) : null}
    </Box>
);

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

/** What the agent will read from, so an empty page still shows the project is connected. */
const WarehouseLine: FC<{
    view: ViewModel;
    onAsk: ((prompt: string) => void) | null;
}> = ({ view, onAsk }) => {
    const { data: project } = useProject(view.project.id);
    const { data: catalog } = useTables({ projectUuid: view.project.id });
    const type = project?.warehouseConnection?.type;
    if (!type || !catalog) return null;
    const schemas = Object.entries(catalog).flatMap(([, database]) =>
        Object.entries(database),
    );
    const tableCount = schemas.reduce(
        (sum, [, tables]) => sum + Object.keys(tables).length,
        0,
    );
    if (tableCount === 0) return null;
    const where = schemas.length === 1 ? ` in ${schemas[0][0]}` : '';
    const text = `${getWarehouseLabel(type) ?? 'Warehouse'} · ${tableCount} ${tableCount === 1 ? 'table' : 'tables'}${where}`;
    const icon = getWarehouseIcon(type, 16);
    return onAsk ? (
        <Button
            size="xs"
            variant="subtle"
            color="gray"
            leftSection={icon}
            onClick={() => onAsk(STUDIO_STARTERS[0].prompt)}
        >
            {text}
        </Button>
    ) : (
        <Group gap={6} c="dimmed" fz="xs">
            {icon}
            {text}
        </Group>
    );
};

export const BuildFirstModel: FC<{
    view: ViewModel;
    /** Left out while the chat is already open beside this. */
    onAsk: ((prompt: string) => void) | null;
    /** The chat's own composer, left out with onAsk. */
    firstRequest: ReactNode;
}> = ({ view, onAsk, firstRequest }) => (
    <Box className={classes.starter}>
        <Stack align="center" gap="lg" w="100%" maw={640}>
            <StudioDraftIllustration width={280} />
            <Stack gap="xs" align="center" ta="center" maw={480}>
                <Title order={3}>Build your semantic layer</Title>
                <Text c="dimmed" fz="sm">
                    Define your metrics once, and every chart, dashboard and
                    answer calculates them the same way.
                </Text>
            </Stack>
            <WarehouseLine view={view} onAsk={onAsk} />
            {firstRequest}
            <StartFromLiveSource view={view} />
        </Stack>
    </Box>
);

export const EmptyProject: FC<{ view: ViewModel; hasAgents: boolean }> = ({
    view,
    hasAgents,
}) => {
    const { options, pathOf } = useAddSource(view);
    const { data: project } = useProject(view.project.id);
    const canEdit = useCanEditSemanticLayer(view.project.id);
    const isCopilotEnabled =
        useAiOrganizationSettings().data?.isCopilotEnabled === true;
    if (!project) return null;

    const hasWarehouse = !!project.warehouseConnection;
    const connect = options.find(({ key }) => key === WAREHOUSE_OPTION);
    const hasAgent = canEdit && hasAgents;
    const hasConnectedProject =
        project.dbtConnection.type !== DbtProjectType.NONE;
    const getCopy = () => {
        if (!hasWarehouse) {
            return {
                title: 'Connect a warehouse to start',
                description: `Your metrics are built from the data in your warehouse. ${connect ? 'Add its credentials in project settings.' : 'Ask a project admin to connect one.'}`,
            };
        }
        if (hasConnectedProject) {
            return {
                title: 'No models yet',
                description:
                    'Your tables and metrics come from the connected project. They show up here after it refreshes.',
            };
        }
        if (canEdit && !hasAgent && isCopilotEnabled) {
            return {
                title: 'Build your semantic layer',
                description:
                    'An agent reads your warehouse and drafts tables and metrics for you to review. Create one to start.',
            };
        }
        return {
            title: 'Build your semantic layer',
            description:
                'Define your tables and metrics in YAML files, then deploy them with the CLI.',
        };
    };
    const { title, description } = getCopy();
    return (
        <Box className={classes.starter}>
            <Stack align="center" gap="xl" w="100%" maw={460} ta="center">
                <StarterModelCode showWarehouses={!hasWarehouse} />
                <Stack gap="xs" align="center">
                    <Title order={3}>{title}</Title>
                    <Text c="dimmed" fz="sm">
                        {description}
                    </Text>
                </Stack>
                {connect ? (
                    <Button component={Link} to={pathOf(connect) ?? ''}>
                        Connect a warehouse
                    </Button>
                ) : null}
                {hasWarehouse &&
                !hasConnectedProject &&
                !hasAgent &&
                canEdit &&
                isCopilotEnabled ? (
                    <Button
                        component={Link}
                        to={getNewAgentUrl(view.project.id)}
                    >
                        Create an agent
                    </Button>
                ) : null}
                <StartFromSources view={view} />
            </Stack>
        </Box>
    );
};
