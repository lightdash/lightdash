import { subject } from '@casl/ability';
import { DbtProjectType, JobStatusType, ProjectType } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Group,
    Menu,
    Popover,
    Stack,
    Text,
    Tooltip,
    type ButtonProps,
} from '@mantine/core';
import { IconChevronDown, IconRefresh } from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useContentAsCodeSettings } from '../../features/contentAsCode/hooks/useContentAsCodeSettings';
import { useProject } from '../../hooks/useProject';
import { useProjectUuid } from '../../hooks/useProjectUuid';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useAbilityContext } from '../../providers/Ability/useAbilityContext';
import useActiveJob from '../../providers/ActiveJob/useActiveJob';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';
import { useIsGitProject } from '../Explorer/WriteBackModal/hooks';

type RefreshMode = 'dbt' | 'dbt-and-content';

// Remembered per project: teams differ on whether a refresh should also sync
const refreshModeStorageKey = (projectUuid: string) =>
    `lightdash-refresh-dbt-mode:${projectUuid}`;

const MODE_COPY: Record<
    RefreshMode,
    { label: string; description: string; busy: string; tooltip: string }
> = {
    dbt: {
        label: 'Refresh dbt',
        description: 'Recompile explores from your dbt project',
        busy: 'Refreshing dbt',
        tooltip:
            "If you've updated your YAML files, you can sync your changes to Lightdash by clicking this button.",
    },
    'dbt-and-content': {
        label: 'Refresh dbt and sync content',
        description: 'Then pull charts and dashboards as code from the repo',
        busy: 'Refreshing dbt and content',
        tooltip:
            'Recompiles your dbt project, then applies charts and dashboards as code from the repo.',
    },
};

const loadStoredMode = (projectUuid: string): RefreshMode => {
    try {
        return localStorage.getItem(refreshModeStorageKey(projectUuid)) ===
            'dbt-and-content'
            ? 'dbt-and-content'
            : 'dbt';
    } catch {
        return 'dbt';
    }
};

const storeMode = (projectUuid: string, mode: RefreshMode) => {
    try {
        localStorage.setItem(refreshModeStorageKey(projectUuid), mode);
    } catch {
        // Per-viewer convenience only
    }
};

const RefreshDbtButton: FC<{
    // Surfaces with their own refresh copy keep the plain button
    allowContentSync?: boolean;
    onClick?: () => void;
    buttonStyles?: ButtonProps['style'];
    leftIcon?: React.ReactNode;
    defaultTextOverride?: React.ReactNode;
    refreshingTextOverride?: React.ReactNode;
}> = ({
    allowContentSync = true,
    onClick,
    buttonStyles,
    leftIcon,
    defaultTextOverride,
    refreshingTextOverride,
}) => {
    const projectUuid = useProjectUuid();
    const { data } = useProject(projectUuid);
    const { activeJob } = useActiveJob();
    const { mutate: refreshDbtServer } = useRefreshServer();
    const [isLoading, setIsLoading] = useState(false);
    const ability = useAbilityContext();
    const isGitProject = useIsGitProject(projectUuid ?? '');
    const { data: contentAsCodeSettings } =
        useContentAsCodeSettings(projectUuid);
    const [mode, setMode] = useState<RefreshMode>(() =>
        loadStoredMode(projectUuid ?? ''),
    );

    const { track } = useTracking();

    useEffect(() => {
        if (activeJob) {
            if (
                [JobStatusType.STARTED, JobStatusType.RUNNING].includes(
                    activeJob.jobStatus,
                )
            ) {
                setIsLoading(true);
            }

            if (
                [JobStatusType.DONE, JobStatusType.ERROR].includes(
                    activeJob.jobStatus,
                )
            ) {
                setIsLoading(false);
            }
        }
    }, [activeJob, activeJob?.jobStatus]);

    if (
        ability?.cannot('manage', 'Job') ||
        ability?.cannot('manage', 'CompileProject')
    )
        return null;

    if (
        data?.dbtConnection?.type === DbtProjectType.NONE ||
        data?.dbtConnection?.type === DbtProjectType.MANIFEST
    ) {
        if (data?.dbtConnection.hideRefreshButton) {
            return null;
        }
        return (
            <Popover withArrow width={300}>
                <Popover.Target>
                    <Box className="ld-pointer">
                        <Button
                            size="xs"
                            variant="outline"
                            leftSection={<MantineIcon icon={IconRefresh} />}
                            disabled
                        >
                            Refresh dbt
                        </Button>
                    </Box>
                </Popover.Target>
                <Popover.Dropdown>
                    <Text>
                        You're still connected to a dbt project created from the
                        CLI.
                        <br />
                        To keep your Lightdash project in sync with your dbt
                        project,
                        <br /> you need to either{' '}
                        <Anchor
                            href={
                                'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            change your connection type
                        </Anchor>
                        , setup a{' '}
                        <Anchor
                            href={
                                'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            GitHub action
                        </Anchor>
                        <br />
                        or, run{' '}
                        <Anchor
                            href={
                                'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            lightdash deploy
                        </Anchor>
                        ) from your command line.
                    </Text>
                </Popover.Dropdown>
            </Popover>
        );
    }

    const canSyncContent =
        allowContentSync &&
        isGitProject &&
        contentAsCodeSettings?.syncEnabled === true &&
        ability.can(
            'manage',
            subject('ContentAsCode', {
                organizationUuid: data?.organizationUuid,
                projectUuid,
            }),
        );
    const activeMode: RefreshMode = canSyncContent ? mode : 'dbt';

    const handleRefresh = () => {
        setIsLoading(true);
        refreshDbtServer(
            { syncContent: activeMode === 'dbt-and-content' },
            { onError: () => setIsLoading(false) },
        );
        onClick?.();
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    const selectMode = (nextMode: RefreshMode) => {
        setMode(nextMode);
        if (projectUuid) storeMode(projectUuid, nextMode);
    };

    const busy = isLoading;
    const busyLabel = MODE_COPY[activeMode].busy;

    const refreshButton = (
        <Tooltip
            w={320}
            position="bottom"
            label={MODE_COPY[activeMode].tooltip}
        >
            <Button
                size="xs"
                variant="default"
                leftSection={leftIcon ?? <MantineIcon icon={IconRefresh} />}
                loading={busy}
                onClick={handleRefresh}
                style={canSyncContent ? undefined : buttonStyles}
            >
                {!busy
                    ? (defaultTextOverride ?? MODE_COPY[activeMode].label)
                    : (refreshingTextOverride ?? busyLabel)}
            </Button>
        </Tooltip>
    );

    return (
        <Group gap="xs">
            {canSyncContent ? (
                <Button.Group>
                    {refreshButton}
                    <Menu
                        position="bottom-end"
                        withArrow
                        offset={2}
                        arrowOffset={10}
                    >
                        <Menu.Target>
                            <Button
                                size="xs"
                                p={4}
                                variant="default"
                                disabled={busy}
                                aria-label="Change refresh mode"
                            >
                                <MantineIcon icon={IconChevronDown} size="sm" />
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            {(['dbt', 'dbt-and-content'] as const).map(
                                (option) => (
                                    <Menu.Item
                                        key={option}
                                        onClick={() => selectMode(option)}
                                    >
                                        <Stack gap="two">
                                            <Text
                                                fz="xs"
                                                fw={600}
                                                c={
                                                    activeMode === option
                                                        ? 'blue'
                                                        : undefined
                                                }
                                            >
                                                {MODE_COPY[option].label}
                                            </Text>
                                            <Text fz="xs" c="dimmed">
                                                {MODE_COPY[option].description}
                                            </Text>
                                        </Stack>
                                    </Menu.Item>
                                ),
                            )}
                        </Menu.Dropdown>
                    </Menu>
                </Button.Group>
            ) : (
                refreshButton
            )}
            {data?.type === ProjectType.PREVIEW && (
                <Tooltip
                    label={`Developer previews are temporary Lightdash projects`}
                >
                    <Badge color="yellow" size="lg">
                        Developer preview
                    </Badge>
                </Tooltip>
            )}
        </Group>
    );
};

export default RefreshDbtButton;
