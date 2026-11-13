import { Group, Stack, Text, ThemeIcon } from '@mantine/core';
import {
    IconHandMove,
    IconLayoutList,
    IconRefresh,
    type Icon,
} from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import ExplorerDemo from './ExplorerDemo';

const HIGHLIGHTS: { icon: Icon; title: string; body: string }[] = [
    {
        icon: IconHandMove,
        title: 'Drag fields onto a chart',
        body: 'Drop a field on Chart and it picks a chart type for you.',
    },
    {
        icon: IconRefresh,
        title: 'Results that keep up',
        body: 'See when your fields have changed, and re-run on every change if you like.',
    },
    {
        icon: IconLayoutList,
        title: 'Less on screen',
        body: 'Sections stay closed until there is something in them.',
    },
];

type Props = {
    opened: boolean;
    onStart: () => void;
    onSkip: () => void;
};

/** The first thing a returning user sees: what changed, then an offer to look. */
const ExplorerWelcome: FC<Props> = ({ opened, onStart, onSkip }) => (
    <MantineModal
        opened={opened}
        onClose={onSkip}
        title="Meet the new Explorer"
        size="md"
        confirmLabel="Show me around"
        onConfirm={onStart}
        cancelLabel="Skip"
    >
        <Stack gap="md">
            <ExplorerDemo />
            <Text fz="sm" c="dimmed">
                Same data and the same charts, in a tidier workspace. Three
                things are worth knowing.
            </Text>
            <Stack gap="sm">
                {HIGHLIGHTS.map(({ icon, title, body }) => (
                    <Group
                        key={title}
                        gap="sm"
                        wrap="nowrap"
                        align="flex-start"
                    >
                        <ThemeIcon variant="light" color="gray" size="md">
                            <MantineIcon icon={icon} />
                        </ThemeIcon>
                        <Stack gap={0}>
                            <Text fz="sm" fw={600}>
                                {title}
                            </Text>
                            <Text fz="xs" c="dimmed">
                                {body}
                            </Text>
                        </Stack>
                    </Group>
                ))}
            </Stack>
        </Stack>
    </MantineModal>
);

export default ExplorerWelcome;
