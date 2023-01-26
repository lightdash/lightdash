import { Tooltip2 } from '@blueprintjs/popover2';
import { DbtProjectType, ProjectType } from '@lightdash/common';
import React, { ComponentProps, FC } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useActiveJob } from '../../providers/ActiveJobProvider';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { BigButton } from '../common/BigButton';
import {
    DisabledRefreshDbt,
    LoadingSpinner,
    PreviewTag,
    RefreshDbt,
} from './RefreshDbtbutton.styles';

const RefreshDbtButton: FC<ComponentProps<typeof BigButton>> = (props) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data } = useProject(projectUuid);
    const { activeJob } = useActiveJob();
    const { mutate } = useRefreshServer();
    const isLoading = activeJob && activeJob?.jobStatus === 'RUNNING';

    const { track } = useTracking();
    const { user } = useApp();

    if (
        user.data?.ability?.cannot('manage', 'Job') ||
        user.data?.ability?.cannot('manage', 'Project')
    )
        return <div></div>;

    if (data?.dbtConnection?.type === DbtProjectType.NONE) {
        if (data?.dbtConnection.hideRefreshButton) {
            return <div />;
        }
        return (
            <Tooltip2
                hoverCloseDelay={500}
                interactionKind="hover"
                content={
                    <p>
                        You're still connected to a dbt project created from the
                        CLI.
                        <br />
                        To keep your Lightdash project in sync with your dbt
                        project,
                        <br /> you need to either{' '}
                        <a
                            href={
                                'https://docs.lightdash.com/get-started/setup-lightdash/connect-project#2-import-a-dbt-project'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            change your connection type
                        </a>
                        , setup a{' '}
                        <a
                            href={
                                'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#automatically-deploy-your-changes-to-lightdash-using-a-github-action'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            GitHub action
                        </a>
                        <br />
                        or, run{' '}
                        <a
                            href={
                                'https://docs.lightdash.com/guides/cli/how-to-use-lightdash-deploy#lightdash-deploy-syncs-the-changes-in-your-dbt-project-to-lightdash'
                            }
                            target="_blank"
                            rel="noreferrer"
                        >
                            lightdash deploy
                        </a>
                        ) from your command line.
                    </p>
                }
            >
                <DisabledRefreshDbt
                    minimal
                    disabled
                    icon="refresh"
                    text="Refresh dbt"
                />
            </Tooltip2>
        );
    }

    const onClick = () => {
        mutate();
        track({
            name: EventName.REFRESH_DBT_CONNECTION_BUTTON_CLICKED,
        });
    };

    if (data?.type === ProjectType.PREVIEW) {
        return (
            <Tooltip2
                content={`Developer previews are temporary Lightdash projects`}
            >
                <PreviewTag intent="warning" large minimal>
                    Developer preview
                </PreviewTag>
            </Tooltip2>
        );
    }

    return (
        <RefreshDbt
            {...props}
            icon={!isLoading ? 'refresh' : <LoadingSpinner size={15} />}
            text={!isLoading ? 'Refresh dbt' : 'Refreshing dbt'}
            onClick={onClick}
        />
    );
};

export default RefreshDbtButton;
