import { type Explore } from '@lightdash/common';
import { Badge, HoverCard, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { useProjectUuid } from '../../../hooks/useProjectUuid';
import { useLiveSourceUserSignIns } from '../hooks/useLiveSourceUserSignIns';
import { getDefaultDateRangeNote } from './apiSourceExplore';
import { getLiveSource } from './liveSourceCatalog';
import { LiveSourceIcon } from './LiveSourceIcon';

export const LiveSourceExploreBadge: FC<{ explore: Explore }> = ({
    explore,
}) => {
    const projectUuid = useProjectUuid();
    const { data: userSignIns } = useLiveSourceUserSignIns(
        explore.apiSource ? projectUuid : undefined,
    );
    if (!explore.apiSource) {
        return null;
    }
    const { connectionUuid } = explore.apiSource;
    // Listed only when the source queries with each viewer's own sign-in
    const isYourAccess =
        userSignIns?.some(
            (signIn) => signIn.externalConnectionUuid === connectionUuid,
        ) ?? false;
    const { label } = getLiveSource(explore.apiSource.integration);
    const dateRangeNote = getDefaultDateRangeNote(explore);
    return (
        <HoverCard position="bottom-start" withArrow openDelay={200}>
            <HoverCard.Target>
                <Badge
                    size="sm"
                    variant="light"
                    leftSection={
                        <LiveSourceIcon
                            connector={explore.apiSource.integration}
                            size={12}
                        />
                    }
                >
                    {isYourAccess ? 'Live · your access' : 'Live'}
                </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown maw={320} p="sm">
                <Stack gap="xs">
                    <Text fz="sm">
                        Each query is one request to {label}, so results are
                        always current.
                    </Text>
                    {isYourAccess && (
                        <Text fz="sm">
                            Shown with your own {label} access, so others may
                            see different numbers.
                        </Text>
                    )}
                    {dateRangeNote && <Text fz="sm">{dateRangeNote}</Text>}
                    <Text fz="xs" c="dimmed">
                        Not available yet: table calculations, custom fields,
                        pivots, date zoom and underlying data.
                    </Text>
                </Stack>
            </HoverCard.Dropdown>
        </HoverCard>
    );
};
