import {
    getAppDisplayName,
    isAppVersionInProgress,
    type ApiAppSummary,
} from '@lightdash/common';
import { Anchor, Box, Group, Loader } from '@mantine/core';
import { IconArrowUpRight } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import useTracking from '../../../providers/Tracking/useTracking';
import { EventName } from '../../../types/Events';
import { useRecentApps } from '../hooks/useMyApps';
import classes from './RecentAppSuggestions.module.css';

const RECENT_APP_SUGGESTION_LIMIT = 2;

const RecentAppSuggestion: FC<{
    app: ApiAppSummary;
    position: number;
    onClick: (app: ApiAppSummary, position: number) => void;
}> = ({ app, position, onClick }) => {
    const displayName = getAppDisplayName(app.name, app.appUuid);
    const isBuilding =
        app.lastVersionStatus !== null &&
        isAppVersionInProgress(app.lastVersionStatus);

    return (
        <Anchor
            component={Link}
            to={`/projects/${app.projectUuid}/apps/${app.appUuid}`}
            className={classes.suggestion}
            title={`Continue building: ${displayName}`}
            onClick={() => onClick(app, position)}
        >
            <Group gap={4} wrap="nowrap">
                {isBuilding ? (
                    <Loader size={10} color="blue.6" />
                ) : (
                    <MantineIcon
                        icon={IconArrowUpRight}
                        size={12}
                        color="ldGray.5"
                    />
                )}
                <span className={classes.prefix}>Continue building:</span>
                <span className={classes.label}>{displayName}</span>
                {isBuilding && (
                    <span className={classes.status}>
                        · Building
                        {app.lastVersionNumber !== null
                            ? ` v${app.lastVersionNumber}`
                            : ''}
                    </span>
                )}
                {app.lastVersionStatus === 'error' && (
                    <span
                        className={`${classes.status} ${classes.errorStatus}`}
                    >
                        · Build failed
                    </span>
                )}
            </Group>
        </Anchor>
    );
};

const RecentAppSuggestions: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { data, isLoading, isError } = useRecentApps(
        projectUuid,
        RECENT_APP_SUGGESTION_LIMIT,
    );
    const { track } = useTracking();
    const apps = data?.data;

    if (isLoading || isError || !apps || apps.length === 0) return null;

    return (
        <Box className={classes.suggestions}>
            {apps.map((app, position) => (
                <RecentAppSuggestion
                    key={app.appUuid}
                    app={app}
                    position={position}
                    onClick={(clickedApp, clickedPosition) => {
                        track({
                            name: EventName.DATA_APP_RECENT_SUGGESTION_CLICK,
                            properties: {
                                projectId: projectUuid,
                                appId: clickedApp.appUuid,
                                position: clickedPosition,
                                status: clickedApp.lastVersionStatus,
                                version: clickedApp.lastVersionNumber,
                            },
                        });
                    }}
                />
            ))}
        </Box>
    );
};

export default RecentAppSuggestions;
