import { formatTimestamp, TimeFrames } from '@lightdash/common';
import {
    ActionIcon,
    Alert,
    Badge,
    Center,
    Group,
    Pagination,
    Paper,
    Skeleton,
    Stack,
    Table,
    Text,
    ThemeIcon,
    Title,
    Tooltip,
} from '@mantine-8/core';
import {
    IconAlertCircle,
    IconBrandGithub,
    IconBrandGitlab,
    IconGitPullRequest,
    IconMessageCircle,
} from '@tabler/icons-react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import { usePullRequestsTable } from '../hooks/usePullRequestsTable';
import { type PullRequestRow } from '../types';
import {
    DEFAULT_PULL_REQUESTS_PAGE_SIZE,
    EMPTY_VALUE,
    getProviderLabel,
    getSourceColor,
    getSourceLabel,
    getStateColor,
    getStateLabel,
    getThreadPath,
} from '../utils';
import classes from './PullRequestsPage.module.css';

dayjs.extend(relativeTime);

type Props = { projectUuid: string };

const SKELETON_ROW_KEYS = [
    'skeleton-0',
    'skeleton-1',
    'skeleton-2',
    'skeleton-3',
    'skeleton-4',
] as const;

const PullRequestRowItem: FC<{ row: PullRequestRow }> = ({ row }) => {
    const threadPath = getThreadPath(row);
    const ProviderIcon =
        row.provider === 'github' ? IconBrandGithub : IconBrandGitlab;

    return (
        <Table.Tr className={classes.row}>
            <Table.Td>
                <ThemeIcon
                    variant="light"
                    color={getStateColor(row.state)}
                    radius="xl"
                    size={34}
                    className={classes.medallion}
                >
                    <MantineIcon icon={IconGitPullRequest} size="md" />
                </ThemeIcon>
            </Table.Td>
            <Table.Td>
                <Tooltip
                    label={formatTimestamp(row.createdAt, TimeFrames.MINUTE)}
                    openDelay={300}
                    withinPortal
                >
                    <Text size="sm" c="ldGray.7" span>
                        {dayjs(row.createdAt).fromNow()}
                    </Text>
                </Tooltip>
            </Table.Td>
            <Table.Td>
                {row.author ? (
                    <Text size="sm" truncate>
                        {row.author.name}
                    </Text>
                ) : (
                    <Text size="sm" c="dimmed">
                        Unknown
                    </Text>
                )}
            </Table.Td>
            <Table.Td>
                <Group gap="xs" wrap="nowrap">
                    {row.title ? (
                        <Tooltip
                            label={row.title}
                            openDelay={400}
                            multiline
                            maw={420}
                            withinPortal
                        >
                            <Text size="sm" truncate className={classes.title}>
                                {row.title}
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text size="sm" c="dimmed" className={classes.title}>
                            {EMPTY_VALUE}
                        </Text>
                    )}
                    <Badge
                        size="xs"
                        variant="outline"
                        color={getSourceColor(row.source)}
                        radius="sm"
                        className={classes.sourceBadge}
                    >
                        {getSourceLabel(row.source)}
                    </Badge>
                </Group>
            </Table.Td>
            <Table.Td>
                {row.state ? (
                    <Badge
                        variant="light"
                        color={getStateColor(row.state)}
                        radius="sm"
                    >
                        {getStateLabel(row.state)}
                    </Badge>
                ) : (
                    <Text size="sm" c="dimmed">
                        {EMPTY_VALUE}
                    </Text>
                )}
            </Table.Td>
            <Table.Td>
                {threadPath !== null ? (
                    <Tooltip label="Open thread" openDelay={300} withinPortal>
                        <ActionIcon
                            component={Link}
                            to={threadPath}
                            variant="subtle"
                            color="gray"
                            aria-label="Open thread"
                        >
                            <MantineIcon icon={IconMessageCircle} />
                        </ActionIcon>
                    </Tooltip>
                ) : null}
            </Table.Td>
            <Table.Td>
                <Tooltip
                    label={`View on ${getProviderLabel(row.provider)}`}
                    openDelay={300}
                    withinPortal
                >
                    <ActionIcon
                        component="a"
                        href={row.prUrl}
                        target="_blank"
                        rel="noreferrer"
                        variant="subtle"
                        color="dark"
                        aria-label={`View pull request on ${getProviderLabel(
                            row.provider,
                        )}`}
                    >
                        <MantineIcon icon={ProviderIcon} />
                    </ActionIcon>
                </Tooltip>
            </Table.Td>
        </Table.Tr>
    );
};

const PullRequestSkeletonRow: FC = () => (
    <Table.Tr className={classes.row}>
        <Table.Td>
            <Skeleton height={34} width={34} circle />
        </Table.Td>
        <Table.Td>
            <Skeleton height={12} width={90} radius="sm" />
        </Table.Td>
        <Table.Td>
            <Skeleton height={12} width="70%" radius="sm" />
        </Table.Td>
        <Table.Td>
            <Group gap="xs" wrap="nowrap">
                <Skeleton height={12} width="80%" radius="sm" />
                <Skeleton height={16} width={64} radius="sm" />
            </Group>
        </Table.Td>
        <Table.Td>
            <Skeleton height={18} width={56} radius="sm" />
        </Table.Td>
        <Table.Td>
            <Skeleton height={24} width={24} circle />
        </Table.Td>
        <Table.Td>
            <Skeleton height={24} width={24} circle />
        </Table.Td>
    </Table.Tr>
);

const PullRequestsTableShell: FC<{
    children: React.ReactNode;
    dimmed: boolean;
}> = ({ children, dimmed }) => (
    <Paper
        withBorder
        shadow="subtle"
        radius="md"
        className={classes.tablePaper}
    >
        <Table.ScrollContainer minWidth={720}>
            <Table
                verticalSpacing="sm"
                horizontalSpacing="sm"
                className={classes.table}
            >
                <Table.Thead className={classes.thead}>
                    <Table.Tr>
                        <Table.Th
                            className={classes.th}
                            aria-label="Pull request"
                        />
                        <Table.Th className={classes.th}>Created</Table.Th>
                        <Table.Th className={classes.th}>User</Table.Th>
                        <Table.Th className={classes.th}>Title</Table.Th>
                        <Table.Th className={classes.th}>State</Table.Th>
                        <Table.Th className={classes.th}>Thread</Table.Th>
                        <Table.Th className={classes.th}>PR</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody
                    className={dimmed ? classes.tbodyFetching : undefined}
                >
                    {children}
                </Table.Tbody>
            </Table>
        </Table.ScrollContainer>
    </Paper>
);

const PullRequestsPage: FC<Props> = ({ projectUuid }) => {
    const [page, setPage] = useState(1);
    const { rows, pagination, isLoading, isFetching, error } =
        usePullRequestsTable(projectUuid, {
            page,
            pageSize: DEFAULT_PULL_REQUESTS_PAGE_SIZE,
        });

    const totalResults = pagination?.totalResults ?? rows.length;

    return (
        <Stack gap="md">
            <Stack gap="two">
                <Title order={5}>Pull requests</Title>
                <Text size="sm" c="dimmed">
                    Pull requests opened from this project, including changes
                    proposed by AI agents and the in-app editors.
                </Text>
            </Stack>

            {error ? (
                <Alert
                    icon={<MantineIcon icon={IconAlertCircle} />}
                    color="red"
                    title="Failed to load pull requests"
                >
                    {error.error.message}
                </Alert>
            ) : isLoading ? (
                <PullRequestsTableShell dimmed={false}>
                    {SKELETON_ROW_KEYS.map((key) => (
                        <PullRequestSkeletonRow key={key} />
                    ))}
                </PullRequestsTableShell>
            ) : rows.length === 0 ? (
                <Center p="xl">
                    <Stack gap="xs" align="center">
                        <MantineIcon
                            icon={IconGitPullRequest}
                            size="xl"
                            color="ldGray.5"
                        />
                        <Text size="sm" c="dimmed">
                            No pull requests yet.
                        </Text>
                        <Text size="xs" c="dimmed" ta="center" maw={360}>
                            Changes proposed by AI agents and the in-app editors
                            will appear here once a pull request is opened.
                        </Text>
                    </Stack>
                </Center>
            ) : (
                <Stack gap="sm">
                    <Text size="xs" c="dimmed">
                        {totalResults} pull request
                        {totalResults === 1 ? '' : 's'}
                    </Text>

                    <PullRequestsTableShell dimmed={isFetching}>
                        {rows.map((row) => (
                            <PullRequestRowItem
                                key={row.pullRequestUuid}
                                row={row}
                            />
                        ))}
                    </PullRequestsTableShell>

                    {(pagination?.totalPageCount ?? 1) > 1 ? (
                        <Group justify="flex-end">
                            <Pagination
                                size="sm"
                                total={pagination?.totalPageCount ?? 1}
                                value={page}
                                onChange={setPage}
                            />
                        </Group>
                    ) : null}
                </Stack>
            )}
        </Stack>
    );
};

export default PullRequestsPage;
