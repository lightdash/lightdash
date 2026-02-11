import { type CreateSavedChartVersion } from '@lightdash/common';
import { Button, Tooltip } from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import { useCallback, useMemo, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getExplorerUrlFromCreateSavedChartVersion } from '../../../../hooks/useExplorerRoute';
import { useCreateShareMutation } from '../../../../hooks/useShare';

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

    const { mutateAsync: createShareUrl, isLoading: isCreatingShareUrl } =
        useCreateShareMutation();

    const handleExploreFromHere = useCallback(async () => {
        if (!openInExploreUrl) return;
        const shareUrl = await createShareUrl({
            path: openInExploreUrl.pathname,
            params: `?${openInExploreUrl.search}`,
        });
        window.open(`/share/${shareUrl.nanoid}`, '_blank');
    }, [createShareUrl, openInExploreUrl]);

    const isEnabled = Boolean(openInExploreUrl && canExplore);

    return (
        <Tooltip
            label="Continue exploring this metric further"
            position="bottom"
            disabled={!isEnabled}
        >
            <Button
                variant="default"
                size="xs"
                radius="md"
                leftSection={<MantineIcon icon={IconExternalLink} />}
                disabled={!isEnabled}
                loading={isCreatingShareUrl}
                onClick={handleExploreFromHere}
            >
                Explore from here
            </Button>
        </Tooltip>
    );
};
