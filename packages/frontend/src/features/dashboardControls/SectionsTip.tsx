import { ActionIcon, Group, Text, Tooltip } from '@mantine/core';
import { useLocalStorage, useOs } from '@mantine/hooks';
import { IconBulb, IconX } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
import {
    selectControlSections,
    selectDashboardFilters,
    useDashboardSelector,
} from '../dashboard/store';

// An editor's first row of the bar, teaching how a section starts: shown
// while the dashboard has 2+ filters, no section, and it was not dismissed
export const SectionsTip: FC = () => {
    const os = useOs();
    const [isDismissed, setIsDismissed] = useLocalStorage({
        key: 'dashboard-controls-sections-tip-dismissed',
        defaultValue: false,
        getInitialValueInEffect: false,
    });
    const hasSections = useDashboardSelector(
        (state) => selectControlSections(state).length > 0,
    );
    const filterCount = useDashboardSelector((state) => {
        const { dimensions, metrics } = selectDashboardFilters(state);
        return dimensions.length + metrics.length;
    });
    if (isDismissed || hasSections || filterCount < 2) return null;
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
                    onClick={() => setIsDismissed(true)}
                >
                    <MantineIcon icon={IconX} />
                </ActionIcon>
            </Tooltip>
        </Group>
    );
};
