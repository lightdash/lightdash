import { DbtProjectType, JobStatusType, ProjectType } from '@lightdash/common';
import {
    Anchor,
    Badge,
    Box,
    Button,
    Popover,
    Text,
    Tooltip,
} from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useActiveJob } from '../../providers/ActiveJobProvider';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import MantineIcon from '../common/MantineIcon';

const RefreshDbtButton = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data } = useProject(projectUuid);
    const { activeJob } = useActiveJob();
    const { mutate: refreshDbtServer } = useRefreshServer();
    const [isLoading, setIsLoading] = useState(false);

    const { track } = useTracking();
    const { user } = useApp();

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
        user.data?.ability?.cannot('manage', 'Job') ||
        user.data?.ability?.cannot('manage', 'CompileProject')
    )
        return null;

    if (data?.dbtConnection?.type === DbtProjectType.NONE) {
        if (data?.dbtConnection.hideRefreshButton) {
            return null;
        }
        return (
            <Popover withinPortal withArrow width={300}>
                <Popover.Target>
                    <Box
                        sx={{
                            cursor: 'pointer',
                        }}
                    >
                        <Button
                            size="xs"
                            variant="outline"
                            leftIcon={<MantineIcon icon={IconRefresh} />}
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

    const onClick = () => {
        setIsLoading(true);
        refreshDbtServer();
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    if (data?.type === ProjectType.PREVIEW) {
        return (
            <Tooltip
                withinPortal
                label={`Developer previews are temporary Lightdash projects`}
            >
                <Badge color="yellow" size="lg" radius="sm">
                    Developer preview
                </Badge>
            </Tooltip>
        );
    }

    return (
        <Tooltip
            withinPortal
            multiline
            w={320}
            position="bottom"
            label="If you've updated your YAML files, you can sync your changes to Lightdash by clicking this button."
        >
            <Button
                size="xs"
                variant="default"
                leftIcon={<MantineIcon icon={IconRefresh} />}
                loading={isLoading}
                onClick={onClick}
            >
                {!isLoading ? 'Refresh dbt' : 'Refreshing dbt'}
            </Button>
        </Tooltip>
    );
};

export default RefreshDbtButton;
