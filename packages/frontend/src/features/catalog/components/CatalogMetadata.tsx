import { type CatalogMetadata as CatalogMetadataType } from '@lightdash/common';
import {
    Avatar,
    Badge,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    Paper,
    Stack,
    Table,
    Tabs,
    Text,
    useMantineTheme,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconCornerDownLeft,
    IconDatabase,
    IconLink,
    IconTable,
} from '@tabler/icons-react';
import { useIsFetching } from '@tanstack/react-query';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useTableStyles } from '../../../hooks/styles/useTableStyles';
import { useCatalogContext } from '../context/CatalogProvider';
import { useCatalogAnalytics } from '../hooks/useCatalogAnalytics';
import { CatalogAnalyticCharts } from './CatalogAnalyticCharts';

export const CatalogMetadata: FC = () => {
    const { classes, cx } = useTableStyles();
    const { colors } = useMantineTheme();
    const {
        projectUuid,
        metadata: metadataResults,
        analyticsResults,
        selection,
        setAnalyticsResults,
    } = useCatalogContext();

    const isFetchingAnalytics = useIsFetching({
        queryKey: ['catalog_analytics', projectUuid],
    });

    const history = useHistory();

    const [selectedFieldInTable, setSelectedFieldInTable] = useState<
        string | undefined
    >();

    useEffect(() => {
        setSelectedFieldInTable(undefined);
    }, [selection]);

    const { mutate: getAnalytics } = useCatalogAnalytics(
        projectUuid,
        (data) => {
            if (data) {
                setAnalyticsResults(data);
            }
        },
    );
    const metadata = useMemo(() => {
        const fieldSelected = selection?.field || selectedFieldInTable;
        if (fieldSelected && metadataResults) {
            const field = metadataResults?.fields?.find(
                (f) => f.name === fieldSelected,
            );
            if (!field) return undefined;
            const catalogMetadata: CatalogMetadataType = {
                ...metadataResults,
                name: field.name,
                description: field.description,
                fields: [],
            };
            return catalogMetadata;
        } else {
            return metadataResults;
        }
    }, [metadataResults, selection, selectedFieldInTable]);

    if (!metadata) return null;

    return (
        <Stack h="100vh" spacing="xl">
            <Group spacing="xs">
                <Avatar
                    size="sm"
                    radius="xl"
                    styles={(theme) => ({
                        root: {
                            border: `1px solid ${theme.colors.gray[1]}`,
                        },
                        placeholder: {
                            color: theme.colors.gray[7],
                            backgroundColor: 'white',
                        },
                    })}
                >
                    <MantineIcon icon={IconTable} />
                </Avatar>
                {selectedFieldInTable && (
                    <>
                        <Text
                            color={colors.blue[6]}
                            sx={{ cursor: 'pointer' }}
                            onClick={() => {
                                setSelectedFieldInTable(undefined);
                                if (selection?.table)
                                    getAnalytics({ table: selection.table }); //Restore table analytics
                            }}
                        >
                            {' '}
                            {selection?.table}
                        </Text>
                        {' > '}
                    </>
                )}
                <Text
                    fs="lg"
                    fw={600}
                    onDoubleClick={() => {
                        history.push(
                            `/projects/${projectUuid}/tables/${metadata.modelName}`,
                        );
                    }}
                >
                    {metadata.name}
                </Text>
            </Group>

            <Tabs
                color="dark"
                defaultValue="overview"
                styles={(theme) => ({
                    tabsList: {
                        borderBottom: `1px solid ${theme.colors.gray[3]}`,
                    },
                    panel: {
                        paddingTop: theme.spacing.xl,
                        height: `calc(100vh - 220px)`,
                        overflowY: 'scroll',
                    },
                    tab: {
                        paddingRight: theme.spacing.sm,
                        paddingLeft: 0,
                        fontSize: theme.fontSizes.sm,
                        fontWeight: 500,
                        '&[data-active="true"]': {
                            color: theme.colors.gray[9],
                        },

                        '&:not([data-active])': {
                            color: theme.colors.gray[6],
                        },
                    },
                })}
            >
                <Tabs.List>
                    <Tabs.Tab value={'overview'}>Overview</Tabs.Tab>
                    <Tabs.Tab value={'analytics'}>
                        <Group spacing="xs">
                            {/* TODO replace loading with spinner ?*/}
                            Usage Analytics
                            {isFetchingAnalytics ? (
                                <Loader
                                    color="gray"
                                    size="xs"
                                    speed={1}
                                    radius="xl"
                                    ml="xs"
                                />
                            ) : (
                                <Avatar
                                    radius="xl"
                                    size="xs"
                                    fz="md"
                                    styles={(theme) => ({
                                        placeholder: {
                                            fontSize: theme.fontSizes.xs,
                                            color: theme.colors.gray[7],
                                            backgroundColor:
                                                theme.colors.gray[1],
                                        },
                                    })}
                                >
                                    {analyticsResults?.charts.length || '0'}
                                </Avatar>
                            )}
                        </Group>
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="overview">
                    <Stack>
                        <Box
                            sx={(theme) => ({
                                padding: theme.spacing.sm,
                                border: `1px solid ${theme.colors.gray[3]}`,
                                borderRadius: theme.radius.sm,
                                backgroundColor: theme.colors.gray[0],
                                fontSize: theme.fontSizes.sm,
                            })}
                        >
                            <MarkdownPreview
                                style={{
                                    backgroundColor: colors.gray[0],
                                    fontSize: 'small',
                                }}
                                source={metadata.description}
                            />
                        </Box>

                        <Divider />

                        <Group position="apart">
                            <Group spacing="xs">
                                <MantineIcon
                                    color={colors.gray[5]}
                                    icon={IconDatabase}
                                />
                                <Text fw={500} fz={13} c="gray.7">
                                    Source
                                </Text>
                            </Group>
                            <Text fw={500} fz={13} c="gray.7">
                                {metadata.source}
                            </Text>
                        </Group>

                        <Group position="apart">
                            <Group spacing="xs">
                                <MantineIcon
                                    color={colors.gray[5]}
                                    icon={IconLink}
                                />
                                <Text fw={500} fz={13} c="gray.7">
                                    Joins
                                </Text>
                            </Group>
                            <Text fw={500} fz={13} c="blue">
                                {/* TODO: get tables */}
                                Table 1, Table 2
                            </Text>
                        </Group>

                        <Divider />

                        {selection?.field === undefined &&
                            !selectedFieldInTable && (
                                <Paper withBorder>
                                    <Table
                                        className={cx(
                                            classes.root,
                                            classes.smallPadding,
                                        )}
                                    >
                                        <thead>
                                            <tr>
                                                <th>Field</th>
                                                <th>Type</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {metadata.fields?.map((field) => (
                                                <tr
                                                    key={field.name}
                                                    style={{
                                                        border:
                                                            selection?.field ===
                                                            field.name
                                                                ? `2px solid ${colors.blue[6]}`
                                                                : undefined,
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            color: `${colors.blue[6]}`,
                                                            cursor: 'pointer',
                                                        }}
                                                        onClick={() => {
                                                            setSelectedFieldInTable(
                                                                field.name,
                                                            );
                                                            if (
                                                                selection?.table
                                                            )
                                                                getAnalytics({
                                                                    table: selection.table,
                                                                    field: field.name,
                                                                });
                                                        }}
                                                    >
                                                        {field.name}
                                                    </td>
                                                    <td>
                                                        <Badge
                                                            color="gray.4"
                                                            radius="lg"
                                                            size="xs"
                                                            fz="xs"
                                                            fw={500}
                                                            style={{
                                                                textTransform:
                                                                    'none',
                                                                color: colors
                                                                    .gray[6],
                                                            }}
                                                        >
                                                            {field.basicType}
                                                        </Badge>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </Table>
                                </Paper>
                            )}
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="analytics">
                    <>
                        {analyticsResults && (
                            <CatalogAnalyticCharts
                                projectUuid={projectUuid}
                                analyticResults={analyticsResults}
                            />
                        )}
                    </>
                </Tabs.Panel>
            </Tabs>

            <Stack
                p="sm"
                sx={(theme) => ({
                    backgroundColor: theme.colors.gray[0],
                    border: `1px solid ${theme.colors.gray[4]}`,
                    borderLeft: 0,
                    borderRight: 0,
                    position: 'absolute',
                    bottom: 0,
                    left: 0,
                    width: '100%',
                    color: 'gray',
                })}
            >
                <Group position="apart">
                    <Group>
                        <Group spacing="xs">
                            <Paper
                                withBorder
                                sx={(theme) => ({
                                    backgroundColor: 'white',
                                    border: `1px solid ${theme.colors.gray[9]}`,
                                    borderRadius: theme.radius.sm,
                                    padding: 4,
                                })}
                            >
                                <MantineIcon icon={IconCornerDownLeft} />
                            </Paper>
                            <Text fz="xs" fw={500} c="gray.6">
                                Select Table
                            </Text>
                        </Group>

                        <Group spacing="xs">
                            <Paper
                                withBorder
                                sx={(theme) => ({
                                    backgroundColor: 'white',
                                    border: `1px solid ${theme.colors.gray[9]}`,
                                    borderRadius: theme.radius.sm,
                                    padding: 4,
                                })}
                            >
                                <MantineIcon icon={IconArrowDown} />
                            </Paper>

                            <Paper
                                withBorder
                                sx={(theme) => ({
                                    backgroundColor: 'white',
                                    border: `1px solid ${theme.colors.gray[9]}`,
                                    borderRadius: theme.radius.sm,
                                    padding: 4,
                                })}
                            >
                                <MantineIcon icon={IconArrowUp} />
                            </Paper>
                            <Text fz="xs" fw={500} c="gray.6">
                                Navigate
                            </Text>
                        </Group>
                    </Group>
                    <Button
                        size="xs"
                        sx={(theme) => ({
                            backgroundColor: theme.colors.gray[8],
                            '&:hover': {
                                backgroundColor: theme.colors.gray[9],
                            },
                        })}
                        onClick={() => {
                            history.push(
                                `/projects/${projectUuid}/tables/${metadata.modelName}`,
                            );
                        }}
                    >
                        Select table
                    </Button>
                </Group>
            </Stack>
        </Stack>
    );
};
