import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { useOs } from '@mantine/hooks';
import { IconBulb, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import useDashboardContext from '../../providers/Dashboard/useDashboardContext';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { useSectionsTip } from './useSectionsTip';

// An editor's first row of the bar, teaching how a section starts
export const SectionsTip: FC = () => {
    const os = useOs();
    const { isShown, filterCount, dismiss } = useSectionsTip();
    const { track } = useTracking();
    const dashboardUuid = useDashboardContext((c) => c.dashboard?.uuid);
    if (!isShown) return null;
    return (
        <Group gap="xs" wrap="nowrap" px="lg" pb="xxs" role="note">
            <MantineIcon icon={IconBulb} color="dimmed" />
            <Text size="xs" c="dimmed" flex={1}>
                {`Tip: ${os === 'macos' ? '⌘' : 'Ctrl'} click filters to select them, then Move to new section to group them.`}
            </Text>
            <Tooltip label="Dismiss tip">
                <ActionIcon
                    size="sm"
                    aria-label="Dismiss tip"
                    onClick={() => {
                        track({
                            name: EventName.DASHBOARD_SECTIONS_TIP_DISMISSED,
                            properties: {
                                dashboardUuid,
                                filtersCount: filterCount,
                            },
                        });
                        dismiss();
                    }}
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};
