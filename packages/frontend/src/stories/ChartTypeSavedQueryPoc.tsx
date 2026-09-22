import {
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Paper,
    Progress,
    Skeleton,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    UnstyledButton,
} from '@mantine/core';
import { IconChartBar, IconSearch } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../components/common/MantineIcon';
import classes from './ChartTypeSavedQueryPoc.module.css';

type SavedQuery = {
    id: string;
    name: string;
    description: string;
    fields: string[];
    updated: string;
    rows: Array<{ label: string; value: number }>;
};

const savedQueries: SavedQuery[] = [
    {
        id: 'monthly-revenue',
        name: 'Monthly revenue',
        description: 'Recognized revenue by calendar month',
        fields: ['Month', 'Recognized revenue'],
        updated: 'Updated today',
        rows: [
            { label: 'Jan', value: 42 },
            { label: 'Feb', value: 58 },
            { label: 'Mar', value: 71 },
            { label: 'Apr', value: 64 },
        ],
    },
    {
        id: 'orders-by-region',
        name: 'Orders by region',
        description: 'Completed orders grouped by customer region',
        fields: ['Region', 'Completed orders'],
        updated: 'Updated yesterday',
        rows: [
            { label: 'North', value: 86 },
            { label: 'South', value: 54 },
            { label: 'East', value: 72 },
            { label: 'West', value: 61 },
        ],
    },
];

export type ChartTypeSavedQueryPocState =
    | 'ready'
    | 'loading'
    | 'error'
    | 'empty'
    | 'no-matches';

type Props = { state?: ChartTypeSavedQueryPocState };

const QueryPreview: FC<{ query: SavedQuery }> = ({ query }) => {
    const max = Math.max(...query.rows.map((row) => row.value));

    return (
        <Stack gap="md">
            <Group justify="space-between" align="baseline">
                <Box>
                    <Text fw={600}>Chart preview</Text>
                    <Text size="sm" c="dimmed">
                        Static bars and table rows from the selected fixture
                    </Text>
                </Box>
                <Badge variant="light">Bar chart</Badge>
            </Group>
            <Stack gap="xs" role="img" aria-label={`${query.name} bar chart`}>
                {query.rows.map((row) => (
                    <Group key={row.label} gap="sm" wrap="nowrap">
                        <Text className={classes.chartLabel} size="sm">
                            {row.label}
                        </Text>
                        <Progress value={(row.value / max) * 100} flex={1} />
                        <Text className={classes.chartValue} size="sm" fw={600}>
                            {row.value}
                        </Text>
                    </Group>
                ))}
            </Stack>
            <Table withTableBorder striped highlightOnHover>
                <Table.Caption>
                    Fixture rows used for this preview
                </Table.Caption>
                <Table.Thead>
                    <Table.Tr>
                        {query.fields.map((field) => (
                            <Table.Th key={field}>{field}</Table.Th>
                        ))}
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {query.rows.map((row) => (
                        <Table.Tr key={row.label}>
                            <Table.Td>{row.label}</Table.Td>
                            <Table.Td>{row.value}</Table.Td>
                        </Table.Tr>
                    ))}
                </Table.Tbody>
            </Table>
        </Stack>
    );
};

export const ChartTypeSavedQueryPoc: FC<Props> = ({ state = 'ready' }) => {
    const [search, setSearch] = useState(
        state === 'no-matches' ? 'forecast' : '',
    );
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [prompt, setPrompt] = useState('');
    const [isBuilt, setIsBuilt] = useState(false);
    const queries = state === 'empty' ? [] : savedQueries;
    const selected = queries.find((query) => query.id === selectedId);
    const matches = queries.filter((query) =>
        `${query.name} ${query.description}`
            .toLowerCase()
            .includes(search.trim().toLowerCase()),
    );

    if (state === 'loading') {
        return (
            <Stack className={classes.page} gap="md">
                <Skeleton h={28} w="35%" />
                <Skeleton h={44} />
                <Skeleton h={128} />
            </Stack>
        );
    }

    if (state === 'error') {
        return (
            <Paper className={classes.page} variant="dotted" p="lg">
                <Title order={5}>Saved queries are unavailable</Title>
                <Text size="sm" c="dimmed" mt="xs">
                    Try again when the saved-query list is available.
                </Text>
            </Paper>
        );
    }

    return (
        <Stack className={classes.page} gap="xl">
            <Box>
                <Title order={2}>Create a chart type</Title>
                <Text c="dimmed" mt="xs" maw={620}>
                    Start from a saved query, describe the chart, then review a
                    generated preview.
                </Text>
            </Box>
            <Text size="xs" c="dimmed">
                Prototype · Sample queries and simulated generation.
            </Text>
            <Stack gap="sm">
                <Text fw={600}>1. Choose a saved query</Text>
                <TextInput
                    aria-label="Search saved queries"
                    leftSection={<MantineIcon icon={IconSearch} size={16} />}
                    placeholder="Search saved queries"
                    value={search}
                    onChange={(event) => setSearch(event.currentTarget.value)}
                />
                {queries.length === 0 ? (
                    <Paper variant="dotted" p="lg">
                        <Text fw={500}>No saved queries yet</Text>
                        <Text size="sm" c="dimmed" mt="xs">
                            Save a query to start a chart type from its results.
                        </Text>
                    </Paper>
                ) : matches.length === 0 ? (
                    <Paper variant="dotted" p="lg">
                        <Text fw={500}>No saved queries match “{search}”</Text>
                        <Text size="sm" c="dimmed" mt="xs">
                            Try a different name or clear the search.
                        </Text>
                    </Paper>
                ) : (
                    <Stack gap="xs">
                        {matches.map((query) => {
                            const isSelected = query.id === selectedId;
                            return (
                                <UnstyledButton
                                    key={query.id}
                                    className={classes.queryRow}
                                    data-selected={isSelected || undefined}
                                    aria-pressed={isSelected}
                                    onClick={() => {
                                        setSelectedId(query.id);
                                        setIsBuilt(false);
                                    }}
                                >
                                    <Group
                                        justify="space-between"
                                        wrap="nowrap"
                                    >
                                        <Text fw={600}>{query.name}</Text>
                                        {isSelected && <Badge>Selected</Badge>}
                                    </Group>
                                    <Text size="sm" c="dimmed" mt={4}>
                                        {query.description}
                                    </Text>
                                    <Text size="xs" c="dimmed" mt="xs">
                                        {query.updated}
                                    </Text>
                                </UnstyledButton>
                            );
                        })}
                    </Stack>
                )}
            </Stack>
            {selected && (
                <Stack gap="md">
                    <Divider />
                    <Box>
                        <Text fw={600}>Selected query fields</Text>
                        <Group gap="xs" mt="xs">
                            {selected.fields.map((field) => (
                                <Badge key={field} variant="outline">
                                    {field}
                                </Badge>
                            ))}
                        </Group>
                    </Box>
                    <TextInput
                        label="2. Describe your chart type"
                        placeholder="Compare revenue month over month"
                        value={prompt}
                        onChange={(event) => {
                            setPrompt(event.currentTarget.value);
                            setIsBuilt(false);
                        }}
                    />
                    <Group justify="space-between" align="center">
                        <Text size="sm" c="dimmed">
                            {isBuilt
                                ? 'Preview generated from the selected fixture.'
                                : 'Add a description to build a preview.'}
                        </Text>
                        <Button
                            leftSection={
                                <MantineIcon icon={IconChartBar} size={16} />
                            }
                            disabled={!prompt.trim()}
                            onClick={() => setIsBuilt(true)}
                        >
                            Build chart type
                        </Button>
                    </Group>
                    {isBuilt && (
                        <Paper p={{ base: 'md', sm: 'lg' }}>
                            <QueryPreview query={selected} />
                        </Paper>
                    )}
                </Stack>
            )}
        </Stack>
    );
};
