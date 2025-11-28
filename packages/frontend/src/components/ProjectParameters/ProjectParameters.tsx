import type { ProjectParameterSummary } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Badge,
    Box,
    Code,
    Group,
    JsonInput,
    LoadingOverlay,
    Modal,
    Pagination,
    Paper,
    Stack,
    Table,
    Text,
    TextInput,
    Title,
    Tooltip,
} from '@mantine-8/core';
import { useDebouncedValue, useDisclosure } from '@mantine-8/hooks';
import { IconEye, IconSearch, IconVariable, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useTableStyles } from '../../hooks/styles/useTableStyles';
import { useProjectParametersList } from '../../hooks/useProjectParameters';
import MantineIcon from '../common/MantineIcon';
import { SettingsCard } from '../common/Settings/SettingsCard';
import { DEFAULT_PAGE_SIZE } from '../common/Table/constants';

interface ProjectParametersProps {
    projectUuid: string;
}

interface ConfigModalProps {
    parameterName: string;
    config: Record<string, any>;
    opened: boolean;
    onClose: () => void;
}

const ConfigModal: FC<ConfigModalProps> = ({
    parameterName,
    config,
    opened,
    onClose,
}) => (
    <Modal
        opened={opened}
        onClose={onClose}
        title={
            <Group gap="xs">
                <MantineIcon size="lg" icon={IconVariable} />
                <Title order={4}>
                    Parameter configuration: {parameterName}
                </Title>
            </Group>
        }
        size="lg"
    >
        <JsonInput
            value={JSON.stringify(config, null, 2)}
            minRows={10}
            maxRows={25}
            readOnly
            autosize
        />
    </Modal>
);

const ProjectParameters: FC<ProjectParametersProps> = ({ projectUuid }) => {
    const { cx, classes } = useTableStyles();
    const [search, setSearch] = useState('');
    const [debouncedSearch] = useDebouncedValue(search, 300);
    const [page, setPage] = useState(1);
    const [sortBy, setSortBy] = useState<'name'>('name'); // for now we only support sorting by name, this state will enable future sorting options
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
    const [configModal, configModalHandlers] = useDisclosure();
    const [selectedParameter, setSelectedParameter] = useState<{
        name: string;
        config: Record<string, any>;
    } | null>(null);

    useEffect(() => {
        setPage(1);
    }, [debouncedSearch]);

    const { data, isLoading, isError } = useProjectParametersList({
        projectUuid,
        search: debouncedSearch.trim() || undefined,
        sortBy,
        sortOrder,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
    });

    const parameters = useMemo(() => data?.data ?? [], [data?.data]);
    const pagination = data?.pagination;

    const handleSort = useCallback(
        (column: 'name') => {
            if (sortBy === column) {
                setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
            } else {
                setSortBy(column);
                setSortOrder('desc');
            }
            setPage(1);
        },
        [sortBy, sortOrder],
    );

    const handleViewConfig = useCallback(
        (name: string, config: Record<string, any>) => {
            setSelectedParameter({ name, config });
            configModalHandlers.open();
        },
        [configModalHandlers],
    );

    const getSortIcon = useCallback(
        (column: 'name') => {
            if (sortBy !== column) return null;
            return sortOrder === 'asc' ? '↑' : '↓';
        },
        [sortBy, sortOrder],
    );

    const tableRows = useMemo(
        () =>
            parameters.map((parameter: ProjectParameterSummary) => (
                <Table.Tr
                    key={`${parameter.source}-${parameter.name}-${
                        parameter.modelName || ''
                    }`}
                >
                    <Table.Td>
                        <Group gap="xs">
                            <Code>{parameter.name}</Code>
                        </Group>
                    </Table.Td>
                    <Table.Td>
                        <Badge
                            size="sm"
                            variant="light"
                            color={
                                parameter.source === 'config' ? 'blue' : 'green'
                            }
                        >
                            {parameter.source === 'config'
                                ? 'Lightdash Config'
                                : `${parameter.modelName} Model`}
                        </Badge>
                    </Table.Td>
                    <Table.Td>
                        <Tooltip label="View configuration">
                            <ActionIcon
                                variant="subtle"
                                onClick={() =>
                                    handleViewConfig(
                                        parameter.name,
                                        parameter.config,
                                    )
                                }
                            >
                                <MantineIcon icon={IconEye} />
                            </ActionIcon>
                        </Tooltip>
                    </Table.Td>
                </Table.Tr>
            )),
        [parameters, handleViewConfig],
    );

    if (isError) {
        return (
            <SettingsCard>
                <Text c="red">Failed to load parameters</Text>
            </SettingsCard>
        );
    }

    return (
        <Stack>
            <Text c="dimmed">
                Learn more about parameters in our{' '}
                <Anchor
                    role="button"
                    href="https://docs.lightdash.com/guides/using-parameters#how-to-use-parameters"
                    target="_blank"
                    rel="noreferrer"
                >
                    docs
                </Anchor>
                .
            </Text>

            <SettingsCard shadow="none" p={0}>
                <Paper p="sm" bd={0}>
                    <Group gap="md" align="center">
                        <Title order={5}>Parameters</Title>
                    </Group>

                    <Box mt="sm">
                        <TextInput
                            size="xs"
                            placeholder="Search parameters by name, label, description, or model"
                            onChange={(e) => setSearch(e.target.value)}
                            value={search}
                            w={380}
                            leftSection={<MantineIcon icon={IconSearch} />}
                            rightSection={
                                search.length > 0 && (
                                    <ActionIcon
                                        variant="subtle"
                                        onClick={() => setSearch('')}
                                    >
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                        />
                    </Box>
                </Paper>

                <Table
                    withRowBorders
                    className={cx(classes.root, classes.alignLastTdRight)}
                >
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSort('name')}
                            >
                                <Group gap="xs">
                                    <Text>Parameter</Text>
                                    <Text>{getSortIcon('name')}</Text>
                                </Group>
                            </Table.Th>
                            <Table.Th>
                                <Text ta="left">Source</Text>
                            </Table.Th>
                            <Table.Th></Table.Th>
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody style={{ position: 'relative' }}>
                        {!isLoading && parameters && parameters.length ? (
                            tableRows
                        ) : isLoading ? (
                            <Table.Tr>
                                <Table.Td colSpan={3}>
                                    <Box py="lg">
                                        <LoadingOverlay visible={true} />
                                    </Box>
                                </Table.Td>
                            </Table.Tr>
                        ) : (
                            <Table.Tr>
                                <Table.Td colSpan={3}>
                                    <Text c="ldGray.6" fs="italic" ta="center">
                                        {debouncedSearch
                                            ? 'No parameters found matching your search'
                                            : 'No parameters configured for this project'}
                                    </Text>
                                </Table.Td>
                            </Table.Tr>
                        )}
                    </Table.Tbody>
                </Table>

                {pagination && pagination.totalPageCount > 1 && (
                    <Paper p="sm">
                        <Group justify="center">
                            <Pagination
                                value={page}
                                onChange={setPage}
                                total={pagination.totalPageCount}
                                size="sm"
                            />
                        </Group>
                    </Paper>
                )}
            </SettingsCard>

            {selectedParameter && (
                <ConfigModal
                    parameterName={selectedParameter.name}
                    config={selectedParameter.config}
                    opened={configModal}
                    onClose={configModalHandlers.close}
                />
            )}
        </Stack>
    );
};

export default ProjectParameters;
