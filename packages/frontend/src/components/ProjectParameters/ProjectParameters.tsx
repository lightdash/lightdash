import type { ProjectParameterSummary } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
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
} from '@mantine/core';
import { useDebouncedValue, useDisclosure } from '@mantine/hooks';
import { IconEye, IconSearch, IconX } from '@tabler/icons-react';
import { format } from 'date-fns';
import { useCallback, useMemo, useState, type FC } from 'react';
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
        title={`Parameter Configuration: ${parameterName}`}
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
    const [sortBy, setSortBy] = useState<'name' | 'created_at'>('created_at');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    const [configModal, configModalHandlers] = useDisclosure();
    const [selectedParameter, setSelectedParameter] = useState<{
        name: string;
        config: Record<string, any>;
    } | null>(null);

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
        (column: 'name' | 'created_at') => {
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
        (column: 'name' | 'created_at') => {
            if (sortBy !== column) return null;
            return sortOrder === 'asc' ? '↑' : '↓';
        },
        [sortBy, sortOrder],
    );

    const tableRows = useMemo(
        () =>
            parameters.map((parameter: ProjectParameterSummary) => (
                <tr key={parameter.name}>
                    <td>
                        <Code>{parameter.name}</Code>
                    </td>
                    <td>
                        <Text size="sm" color="dimmed">
                            {format(
                                new Date(parameter.createdAt),
                                'MMM d, yyyy',
                            )}
                        </Text>
                    </td>
                    <td>
                        <Tooltip label="View configuration">
                            <ActionIcon
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
                    </td>
                </tr>
            )),
        [parameters, handleViewConfig],
    );

    if (isError) {
        return (
            <SettingsCard>
                <Text color="red">Failed to load parameters</Text>
            </SettingsCard>
        );
    }

    return (
        <Stack>
            <Text color="dimmed">
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
                <Paper p="sm">
                    <Group spacing="md" align="center">
                        <Title order={5}>Parameters</Title>
                    </Group>

                    <Box mt="sm">
                        <TextInput
                            size="xs"
                            placeholder="Search parameters by name, label, or description"
                            onChange={(e) => setSearch(e.target.value)}
                            value={search}
                            w={380}
                            icon={<MantineIcon icon={IconSearch} />}
                            rightSection={
                                search.length > 0 && (
                                    <ActionIcon onClick={() => setSearch('')}>
                                        <MantineIcon icon={IconX} />
                                    </ActionIcon>
                                )
                            }
                        />
                    </Box>
                </Paper>

                <Table className={cx(classes.root, classes.alignLastTdRight)}>
                    <thead>
                        <tr>
                            <th
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSort('name')}
                            >
                                <Group spacing="xs">
                                    <Text>Parameter Name</Text>
                                    <Text>{getSortIcon('name')}</Text>
                                </Group>
                            </th>
                            <th
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleSort('created_at')}
                            >
                                <Group spacing="xs">
                                    <Text>Created</Text>
                                    <Text>{getSortIcon('created_at')}</Text>
                                </Group>
                            </th>
                            <th></th>
                        </tr>
                    </thead>
                    <tbody style={{ position: 'relative' }}>
                        {!isLoading && parameters && parameters.length ? (
                            tableRows
                        ) : isLoading ? (
                            <tr>
                                <td colSpan={3}>
                                    <Box py="lg">
                                        <LoadingOverlay
                                            visible={true}
                                            transitionDuration={200}
                                        />
                                    </Box>
                                </td>
                            </tr>
                        ) : (
                            <tr>
                                <td colSpan={3}>
                                    <Text c="gray.6" fs="italic" ta="center">
                                        {debouncedSearch
                                            ? 'No parameters found matching your search'
                                            : 'No parameters configured for this project'}
                                    </Text>
                                </td>
                            </tr>
                        )}
                    </tbody>
                </Table>

                {pagination && pagination.totalPageCount > 1 && (
                    <Paper p="sm">
                        <Group position="center">
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
