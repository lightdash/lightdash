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
import {
    IconBrandGithub,
    IconCheck,
    IconChevronDown,
    IconRefresh,
} from '@tabler/icons-react';
import { useEffect, useState, type FC } from 'react';
import { useContentAsCodePullMutation } from '../../features/contentAsCode/hooks/useContentAsCodePull';
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

const REFRESH_MODE_STORAGE_KEY = 'lightdash-refresh-dbt-mode';

const loadStoredMode = (): RefreshMode => {
    try {
        return localStorage.getItem(REFRESH_MODE_STORAGE_KEY) ===
            'dbt-and-content'
            ? 'dbt-and-content'
            : 'dbt';
    } catch {
        return 'dbt';
    }
};

const storeMode = (mode: RefreshMode) => {
    try {
        localStorage.setItem(REFRESH_MODE_STORAGE_KEY, mode);
    } catch {
        // Per-viewer convenience only
    }
};

const RefreshDbtButton: FC<{
    onClick?: () => void;
    buttonStyles?: ButtonProps['style'];
    leftIcon?: React.ReactNode;
    defaultTextOverride?: React.ReactNode;
    refreshingTextOverride?: React.ReactNode;
}> = ({
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
    const [mode, setMode] = useState<RefreshMode>(loadStoredMode);
    const { mutate: pullContent, isLoading: isPulling } =
        useContentAsCodePullMutation(projectUuid);

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
            <Popover withinPortal withArrow width={300}>
                <Popover.Target>
                    <Box
                        style={{
                            cursor: 'pointer',
                        }}
                    >
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

    const handleRefresh = () => {
        setIsLoading(true);
        refreshDbtServer();
        if (mode === 'dbt-and-content' && isGitProject) {
            pullContent();
        }
        onClick?.();
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    const selectMode = (nextMode: RefreshMode) => {
        setMode(nextMode);
        storeMode(nextMode);
    };

    const showModeMenu = isGitProject && defaultTextOverride === undefined;
    const busy = isLoading || isPulling;
    const label =
        mode === 'dbt-and-content' && showModeMenu
            ? 'Refresh dbt + content'
            : 'Refresh dbt';
    const busyLabel =
        mode === 'dbt-and-content' && showModeMenu
            ? 'Refreshing…'
            : 'Refreshing dbt';

    return (
        <Group gap="xs">
            <Group gap={0} wrap="nowrap">
                <Tooltip
                    withinPortal
                    multiline
                    w={320}
                    position="bottom"
                    label={
                        mode === 'dbt-and-content' && showModeMenu
                            ? 'Recompiles your dbt project and pulls charts & dashboards as code from the repo.'
                            : "If you've updated your YAML files, you can sync your changes to Lightdash by clicking this button."
                    }
                >
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={
                            leftIcon ?? <MantineIcon icon={IconRefresh} />
                        }
                        loading={busy}
                        onClick={handleRefresh}
                        style={
                            showModeMenu
                                ? {
                                      borderTopRightRadius: 0,
                                      borderBottomRightRadius: 0,
                                  }
                                : buttonStyles
                        }
                    >
                        {!busy
                            ? (defaultTextOverride ?? label)
                            : (refreshingTextOverride ?? busyLabel)}
                    </Button>
                </Tooltip>
                {showModeMenu && (
                    <Menu withinPortal position="bottom-end" width={320}>
                        <Menu.Target>
                            <Button
                                size="xs"
                                variant="default"
                                px={4}
                                disabled={busy}
                                style={{
                                    borderTopLeftRadius: 0,
                                    borderBottomLeftRadius: 0,
                                    marginLeft: -1,
                                }}
                                aria-label="Change refresh mode"
                            >
                                <MantineIcon icon={IconChevronDown} size="sm" />
                            </Button>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={<MantineIcon icon={IconRefresh} />}
                                rightSection={
                                    mode === 'dbt' ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size="sm"
                                        />
                                    ) : undefined
                                }
                                onClick={() => selectMode('dbt')}
                            >
                                <Stack gap={0}>
                                    <Text size="sm">Refresh dbt</Text>
                                    <Text size="xs" c="dimmed">
                                        Recompile explores from your dbt project
                                    </Text>
                                </Stack>
                            </Menu.Item>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconBrandGithub} />
                                }
                                rightSection={
                                    mode === 'dbt-and-content' ? (
                                        <MantineIcon
                                            icon={IconCheck}
                                            size="sm"
                                        />
                                    ) : undefined
                                }
                                onClick={() => selectMode('dbt-and-content')}
                            >
                                <Stack gap={0}>
                                    <Text size="sm">
                                        Refresh dbt + sync content
                                    </Text>
                                    <Text size="xs" c="dimmed">
                                        Also pull charts & dashboards as code
                                        from the repo
                                    </Text>
                                </Stack>
                            </Menu.Item>
                        </Menu.Dropdown>
                    </Menu>
                )}
            </Group>
            {data?.type === ProjectType.PREVIEW && (
                <Tooltip
                    withinPortal
                    label={`Developer previews are temporary Lightdash projects`}
                >
                    <Badge color="yellow" size="lg" radius="sm">
                        Developer preview
                    </Badge>
                </Tooltip>
            )}
        </Group>
    );
};

export default RefreshDbtButton;
