import { type CreateSavedChartVersion } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useMemo, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';

type Props = {
    projectUuid: string | undefined;
    unsavedChartVersion: CreateSavedChartVersion | undefined;
    canExplore: boolean;
};

export const ExploreFromHereButton: FC<Props> = ({
    projectUuid,
    unsavedChartVersion,
    canExplore,
}) => {
    const openInExploreUrl = useMemo(() => {
        if (!unsavedChartVersion) return undefined;
        return getExplorerUrlFromCreateSavedChartVersion(
            projectUuid,
            unsavedChartVersion,
            true, // preserves series config in the url
        );
    }, [projectUuid, unsavedChartVersion]);

    const isEnabled = Boolean(openInExploreUrl && canExplore);

    return (
        <Tooltip
            label="Continue exploring this metric further"
            position="bottom"
            disabled={!isEnabled}
        >
            {isEnabled ? (
                <Button
                    component={Link}
                    to={openInExploreUrl!}
                    target="_blank"
                    rel="noreferrer"
                    variant="default"
                    size="xs"
                    radius="md"
                    leftSection={<MantineIcon icon={IconExternalLink} />}
                >
                    Explore from here
                </Button>
            ) : (
                <Button
                    component="button"
                    type="button"
                    variant="default"
                    size="xs"
                    radius="md"
                    leftSection={<MantineIcon icon={IconExternalLink} />}
                    disabled
                >
                    Explore from here
                </Button>
            )}
        </Tooltip>
    );
};
