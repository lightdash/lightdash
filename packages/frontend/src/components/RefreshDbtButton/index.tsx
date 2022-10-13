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

    if (data?.dbtConnection?.type === DbtProjectType.NONE)
        return (
            <Tooltip2
                hoverCloseDelay={500}
                interactionKind="hover"
                content={
                    <p>
                        You're still connected to a local dbt project.
                        <br />
                        To keep your Lightdash project in sync, you need to
                        update your dbt connection. <br />
                        <a
                            target="_blank"
                            href="https://docs.lightdash.com/get-started/setup-lightdash/connect-project/#2-import-a-dbt-project"
                            rel="noreferrer"
                        >
                            Find out how to do that here.
                        </a>
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
