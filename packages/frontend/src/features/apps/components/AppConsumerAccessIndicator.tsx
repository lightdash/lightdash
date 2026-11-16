import {
    type DataAppConsumerAccess,
    type DataAppConsumerAccessIssue,
} from '@lightdash/common';
import { Button, Popover, ScrollArea, Stack, Text } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';

const PART_LABELS: Record<
    DataAppConsumerAccessIssue['unresolved'][number],
    string
> = {
    explore: 'table',
    field: 'field',
    dimensions: 'dimensions',
    metrics: 'metrics',
    filters: 'filters',
    metricFilters: 'metric filters',
    sorts: 'sorting',
    parameters: 'parameters',
    localFields: 'custom fields',
    customSql: 'custom SQL',
};

const listParts = (parts: DataAppConsumerAccessIssue['unresolved']) =>
    new Intl.ListFormat('en', { type: 'conjunction' }).format(
        parts.map((part) => PART_LABELS[part]),
    );

const getIssueTitle = (issue: DataAppConsumerAccessIssue) => {
    if (issue.kind === 'globalFilter') return 'A filter across the app';
    return issue.explore ? `A query on ${issue.explore}` : 'A query';
};

type Props = {
    access: DataAppConsumerAccess;
};

/**
 * Tells someone who manages the app that people without Explore access will
 * not get all of its data, and which parts of the source cause that.
 */
const AppConsumerAccessIndicator: FC<Props> = ({ access }) => {
    if (access.status === 'available') return null;
    const isUnavailable = access.status === 'unavailable';

    return (
        <Popover withArrow position="bottom-start">
            <Popover.Target>
                <Button
                    size="compact-xs"
                    variant="light"
                    color="yellow"
                    leftSection={
                        <MantineIcon icon={IconAlertTriangle} size={14} />
                    }
                >
                    {isUnavailable
                        ? 'Not available to Viewers'
                        : 'Limited for Viewers'}
                </Button>
            </Popover.Target>

            <Popover.Dropdown maw={360}>
                <Stack gap="sm">
                    <Stack gap={4}>
                        <Text fz="sm" fw={600}>
                            {isUnavailable
                                ? "Viewers can't load this app's data"
                                : "Viewers can't load some of this app's data"}
                        </Text>
                        <Text fz="xs" c="dimmed">
                            {access.issues.length > 0
                                ? 'People without Explore access see an error in place of the parts below. Ask for fixed fields, filters and sorting there, then build a new version.'
                                : 'This version has no saved record of the data it uses. Build a new version to open it to people without Explore access.'}
                        </Text>
                    </Stack>

                    {access.issues.length > 0 && (
                        <ScrollArea.Autosize mah={240}>
                            <Stack gap="xs">
                                {access.issues.map((issue) => (
                                    <Stack
                                        gap={0}
                                        key={`${issue.location.path}:${issue.location.line}:${issue.location.column}`}
                                    >
                                        <Text fz="xs" fw={500}>
                                            {getIssueTitle(issue)}
                                        </Text>
                                        <Text fz="xs" c="dimmed">
                                            Its {listParts(issue.unresolved)}{' '}
                                            can change while the app runs
                                        </Text>
                                        <Text fz="xs" c="dimmed" ff="monospace">
                                            {issue.location.path}:
                                            {issue.location.line}
                                        </Text>
                                    </Stack>
                                ))}
                            </Stack>
                        </ScrollArea.Autosize>
                    )}
                </Stack>
            </Popover.Dropdown>
        </Popover>
    );
};

export default AppConsumerAccessIndicator;
