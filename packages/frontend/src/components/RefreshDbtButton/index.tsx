import { Tooltip2 } from '@blueprintjs/popover2';
import { ProjectType } from '@lightdash/common';
import { ComponentProps, FC } from 'react';
import { useParams } from 'react-router-dom';
import { useProject } from '../../hooks/useProject';
import { useRefreshServer } from '../../hooks/useRefreshServer';
import { useApp } from '../../providers/AppProvider';
import { useTracking } from '../../providers/TrackingProvider';
import { EventName } from '../../types/Events';
import { BigButton } from '../common/BigButton';
import {
    LoadingSpinner,
    PreviewTag,
    RefreshDbt,
} from './RefreshDbtbutton.styles';

const RefreshDbtButton: FC<ComponentProps<typeof BigButton>> = (props) => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { data } = useProject(projectUuid);
    const { activeJob } = useApp();
    const { mutate } = useRefreshServer();
    const isLoading = activeJob && activeJob?.jobStatus === 'RUNNING';

    const { track } = useTracking();
    const { user } = useApp();

    if (
        user.data?.ability?.cannot('manage', 'Job') ||
        user.data?.ability?.cannot('manage', 'Project')
    )
        return <div></div>;

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
