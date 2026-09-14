import {
    getAppDisplayName,
    type ExternalConnectionListItem,
} from '@lightdash/common';
import { Box, Loader, Select, ThemeIcon } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { type FC } from 'react';
import {
    useProjectAppsByKind,
    type ProjectAppKind,
} from '../../../features/apps/hooks/useProjectApps';
import { useLinkAppExternalConnection } from '../../../features/externalConnections/hooks/useLinkAppExternalConnection';
import MantineIcon from '../../common/MantineIcon';
import classes from './ConnectionUsageModal.module.css';

type Props = {
    projectUuid: string;
    connection: ExternalConnectionListItem;
    linkedAppUuids: string[];
    kind: ProjectAppKind;
};

export const LinkAppRow: FC<Props> = ({
    projectUuid,
    connection,
    linkedAppUuids,
    kind,
}) => {
    const {
        data: projectApps,
        isLoading: isLoadingApps,
        isError: isAppsError,
    } = useProjectAppsByKind(projectUuid, kind);
    const { mutate: link, isLoading: isLinking } =
        useLinkAppExternalConnection();
    const linked = new Set(linkedAppUuids);
    const availableApps = (projectApps ?? [])
        .filter((app) => !linked.has(app.appUuid))
        .sort((left, right) =>
            getAppDisplayName(left.name, left.appUuid).localeCompare(
                getAppDisplayName(right.name, right.appUuid),
            ),
        );

    const handleSelect = (appUuid: string | null) => {
        const app = availableApps.find(
            (candidate) => candidate.appUuid === appUuid,
        );
        if (!app) return;

        link({
            projectUuid,
            appUuid: app.appUuid,
            appName: getAppDisplayName(app.name, app.appUuid),
            externalConnectionUuid: connection.externalConnectionUuid,
            connectionName: connection.name,
        });
    };

    const resourceName = kind === 'data_app' ? 'data app' : 'chart type';
    const resourceNamePlural =
        kind === 'data_app' ? 'data apps' : 'chart types';
    const placeholder = isLoadingApps
        ? `Loading ${resourceNamePlural}...`
        : isAppsError
          ? `Could not load ${resourceNamePlural}`
          : projectApps?.length === 0
            ? `No ${resourceNamePlural} available`
            : availableApps.length === 0
              ? `All ${resourceNamePlural} are linked`
              : `Link a ${resourceName}...`;

    return (
        <Box className={classes.resourceRow}>
            <ThemeIcon variant="light" size="lg" color="gray">
                <MantineIcon icon={IconPlus} />
            </ThemeIcon>
            <Select
                aria-label={`Link a ${resourceName}`}
                searchable
                variant="unstyled"
                flex={1}
                placeholder={
                    isLinking ? `Linking ${resourceName}...` : placeholder
                }
                nothingFoundMessage={`No matching ${resourceNamePlural}`}
                data={availableApps.map((app) => ({
                    value: app.appUuid,
                    label: `${getAppDisplayName(app.name, app.appUuid)} · ${app.slug}`,
                }))}
                value={null}
                onChange={handleSelect}
                disabled={
                    isLoadingApps ||
                    isAppsError ||
                    isLinking ||
                    availableApps.length === 0
                }
                rightSection={isLinking ? <Loader size={14} /> : undefined}
            />
        </Box>
    );
};
