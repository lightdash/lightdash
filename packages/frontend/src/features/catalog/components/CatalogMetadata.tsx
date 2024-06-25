import { type CatalogMetadata as CatalogMetadataType } from '@lightdash/common';
import {
    Avatar,
    Box,
    Button,
    Divider,
    Group,
    Loader,
    LoadingOverlay,
    Paper,
    Stack,
    Tabs,
    Text,
    Tooltip,
    useMantineTheme,
} from '@mantine/core';
import {
    IconArrowDown,
    IconArrowUp,
    IconCornerDownLeft,
    IconDatabase,
    IconLayoutSidebarRightCollapse,
    IconLink,
    IconTable,
} from '@tabler/icons-react';
import { useIsMutating } from '@tanstack/react-query';
import MarkdownPreview from '@uiw/react-markdown-preview';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { useIsTruncated } from '../../../hooks/useIsTruncated';
import { useCatalogContext } from '../context/CatalogProvider';
import { useCatalogAnalytics } from '../hooks/useCatalogAnalytics';
import { useCatalogMetadata } from '../hooks/useCatalogMetadata';
import { CatalogAnalyticCharts } from './CatalogAnalyticCharts';
import { CatalogMetadataFieldsTable } from './CatalogMetadataFieldsTable';

export const CatalogMetadata: FC = () => {
    const history = useHistory();

    const { colors } = useMantineTheme();
    const { ref, isTruncated } = useIsTruncated<HTMLDivElement>();

    const {
        projectUuid,
        metadata: metadataResults,
        setMetadata,
        setSidebarOpen,
        analyticsResults,
        selection,
        setAnalyticsResults,
        setSelection,
    } = useCatalogContext();
    const { reset: resetMetadata } = useCatalogMetadata(projectUuid);
    const isMutatingAnalytics = useIsMutating([
        'catalog_analytics',
        projectUuid,
    ]);
    const isMutatingMetadata = useIsMutating(['catalog_metadata', projectUuid]);

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
                label: field.label,
                tableLabel: field.tableLabel,
                description: field.description,
                fields: [],
            };
            return catalogMetadata;
        } else {
            return metadataResults;
        }
    }, [metadataResults, selection, selectedFieldInTable]);

    return (
        <Stack h="100vh" spacing="xl">
            <Button
                variant="light"
                size="xs"
                pos="absolute"
                left={0}
                top={10}
                compact
                leftIcon={<MantineIcon icon={IconLayoutSidebarRightCollapse} />}
                onClick={() => {
                    setSidebarOpen(false);
                    setSelection(undefined);

                    if (metadata) {
                        resetMetadata();
                        setMetadata(undefined);
                    }
                }}
                sx={{
                    borderLeft: 'none',
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                }}
            >
                Close
            </Button>

            <Group spacing="xs" mt="lg">
                <Avatar
                    size="md"
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
                            color={colors.blue[4]}
                            fz="md"
                            sx={{ cursor: 'pointer' }}
                            onClick={() => {
                                setSelectedFieldInTable(undefined);
                                if (selection?.table)
                                    getAnalytics({
                                        table: selection.table,
                                    }); //Restore table analytics
                            }}
                        >
                            {' '}
                            {metadata?.tableLabel}
                        </Text>
                        {' / '}
                    </>
                )}
                <Tooltip variant="xs" label={metadata?.name}>
                    <Text
                        fz="lg"
                        fw={600}
                        onDoubleClick={() => {
                            history.push(
                                `/projects/${projectUuid}/tables/${metadata?.modelName}`,
                            );
                        }}
                    >
                        {metadata?.label}
                    </Text>
                </Tooltip>
            </Group>

            <LoadingOverlay
                loaderProps={{
                    size: 'sm',
                    color: 'gray.7',
                    pos: 'absolute',
                    variant: 'dots',
                }}
                visible={!metadata || !!isMutatingMetadata}
                transitionDuration={1000}
            />

            <Tabs
                color="dark"
                defaultValue="overview"
                styles={(theme) => ({
                    tabsList: {
                        borderBottom: `1px solid ${theme.colors.gray[3]}`,
                    },
                    panel: {
                        paddingTop: theme.spacing.xl,
                        height: `calc(100vh - 260px)`,
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
                            Usage Analytics
                            <Avatar
                                radius="xl"
                                size="xs"
                                fz="md"
                                styles={(theme) => ({
                                    placeholder: {
                                        fontSize: theme.fontSizes.xs,
                                        color: theme.colors.gray[7],
                                        backgroundColor: theme.colors.gray[1],
                                    },
                                })}
                            >
                                {isMutatingAnalytics ? (
                                    <Loader
                                        color="gray"
                                        size={8}
                                        speed={1}
                                        radius="xl"
                                    />
                                ) : (
                                    analyticsResults?.charts.length || '0'
                                )}
                            </Avatar>
                        </Group>
                    </Tabs.Tab>
                </Tabs.List>

                <Tabs.Panel value="overview">
                    <Stack>
                        {metadata?.description && (
                            <>
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
                                        source={metadata?.description}
                                    />
                                </Box>

                                <Divider />
                            </>
                        )}

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
                                {metadata?.source}
                            </Text>
                        </Group>

                        <Group position="apart" noWrap>
                            <Group spacing="xs" noWrap>
                                <MantineIcon
                                    color={colors.gray[5]}
                                    icon={IconLink}
                                />
                                <Text fw={500} fz={13} c="gray.7">
                                    Joins
                                </Text>
                            </Group>

                            <Tooltip
                                multiline
                                maw={300}
                                variant="xs"
                                label={metadata?.joinedTables.join(', ')}
                                disabled={
                                    !isTruncated ||
                                    !metadata?.joinedTables ||
                                    metadata.joinedTables.length === 0
                                }
                            >
                                <Text
                                    ref={ref}
                                    fw={500}
                                    fz={13}
                                    c={
                                        metadata?.joinedTables &&
                                        metadata.joinedTables.length > 0
                                            ? 'blue'
                                            : 'gray.7'
                                    }
                                    truncate
                                >
                                    {metadata?.joinedTables &&
                                    metadata?.joinedTables.length > 0
                                        ? metadata?.joinedTables.join(', ')
                                        : 'None'}
                                </Text>
                            </Tooltip>
                        </Group>

                        <Divider />

                        {selection?.field === undefined &&
                            !selectedFieldInTable && (
                                <CatalogMetadataFieldsTable
                                    selection={selection}
                                    metadata={metadata}
                                    getAnalytics={getAnalytics}
                                    setSelectedFieldInTable={
                                        setSelectedFieldInTable
                                    }
                                />
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
                h={72}
                justify="center"
                p="sm"
                c="gray"
                w="100%"
                pos="absolute"
                bottom={0}
                left={0}
                sx={(theme) => ({
                    backgroundColor: theme.colors.gray[0],
                    border: `1px solid ${theme.colors.gray[4]}`,
                    borderLeft: 0,
                    borderRight: 0,
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
                        size="sm"
                        sx={(theme) => ({
                            backgroundColor: theme.colors.gray[8],
                            '&:hover': {
                                backgroundColor: theme.colors.gray[9],
                            },
                        })}
                        onClick={() => {
                            history.push(
                                `/projects/${projectUuid}/tables/${metadata?.modelName}`,
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
