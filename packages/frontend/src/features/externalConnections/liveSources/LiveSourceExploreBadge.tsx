import { type Explore } from '@lightdash/common';
import { Badge, HoverCard, Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { getDefaultDateRangeNote } from './apiSourceExplore';
import { getLiveSource } from './liveSourceCatalog';
import { LiveSourceIcon } from './LiveSourceIcon';

export const LiveSourceExploreBadge: FC<{ explore: Explore }> = ({
    explore,
}) => {
    if (!explore.apiSource) {
        return null;
    }
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
                    Live
                </Badge>
            </HoverCard.Target>
            <HoverCard.Dropdown maw={320} p="sm">
                <Stack gap="xs">
                    <Text fz="sm">
                        Each query is one request to {label}, so results are
                        always current.
                    </Text>
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
