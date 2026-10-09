import {
    OrganizationMemberRoleLabels,
    type DepartmentMember,
} from '@lightdash/common';
import { Chip, Group, Pagination, Stack, Table, Text } from '@mantine/core';
import { useEffect, useMemo, useRef, useState, type FC } from 'react';
import {
    countMembersByFilter,
    filterMembers,
    formatAlsoIn,
    formatLastActive,
    formatMemberSource,
    sortMembers,
    type MemberFilter,
    type PersonHighlight,
} from '../utils/departmentDetail';
import { formatCount } from '../utils/format';

const PAGE_SIZE = 50;

const FILTER_LABELS: Record<MemberFilter, string> = {
    all: 'All',
    active30d: 'Active in 30 days',
    inactive30d: 'Not active in 30 days',
    noRecordedActivity: 'No activity in 90 days',
};
const FILTERS: MemberFilter[] = [
    'all',
    'active30d',
    'inactive30d',
    'noRecordedActivity',
];

const isMemberFilter = (value: string): value is MemberFilter =>
    FILTERS.some((filter) => filter === value);

const pageOf = (index: number): number => Math.floor(index / PAGE_SIZE) + 1;

type Props = {
    members: DepartmentMember[];
    // A person picked on the map: their row is marked, shown and scrolled to
    highlight: PersonHighlight | null;
};

export const DepartmentMembersTable: FC<Props> = ({ members, highlight }) => {
    const [filter, setFilter] = useState<MemberFilter>('all');
    const [page, setPage] = useState(1);
    const counts = useMemo(() => countMembersByFilter(members), [members]);
    const sorted = useMemo(() => sortMembers(members), [members]);
    // A person picked is shown on their page, under the filter chosen if it holds them and under All if not
    const [shownRequest, setShownRequest] = useState<number | null>(null);
    if (highlight !== null && highlight.request !== shownRequest) {
        setShownRequest(highlight.request);
        const indexIn = (each: MemberFilter) =>
            filterMembers(sorted, each).findIndex(
                (member) => member.userUuid === highlight.userUuid,
            );
        const index = indexIn(filter);
        if (index >= 0) {
            setPage(pageOf(index));
        } else {
            const everyone = indexIn('all');
            if (everyone >= 0) {
                setFilter('all');
                setPage(pageOf(everyone));
            }
        }
    }
    const filtered = useMemo(
        () => filterMembers(sorted, filter),
        [sorted, filter],
    );
    const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    // The row is brought into view and takes focus, so the keyboard and a screen reader land on the person too
    const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);
    const request = highlight?.request ?? null;
    useEffect(() => {
        const row = highlightedRowRef.current;
        if (request === null || row === null) return;
        row.scrollIntoView({ block: 'center' });
        row.focus({ preventScroll: true });
    }, [request]);

    if (members.length === 0) {
        return (
            <Text fz="sm" c="dimmed">
                No one in this department has an account yet
            </Text>
        );
    }

    return (
        <Stack gap="sm">
            <Chip.Group
                value={filter}
                onChange={(value) => {
                    if (typeof value === 'string' && isMemberFilter(value)) {
                        setFilter(value);
                        setPage(1);
                    }
                }}
            >
                <Group gap="xs">
                    {FILTERS.map((value) => (
                        <Chip key={value} value={value} size="xs">
                            {`${FILTER_LABELS[value]} (${formatCount(counts[value])})`}
                        </Chip>
                    ))}
                </Group>
            </Chip.Group>
            <Table highlightOnHover>
                <Table.Thead>
                    <Table.Tr>
                        <Table.Th>Person</Table.Th>
                        <Table.Th>Role</Table.Th>
                        <Table.Th>In department</Table.Th>
                        <Table.Th>Last active</Table.Th>
                        <Table.Th>Queries, 30 days</Table.Th>
                        <Table.Th>Dashboard views, 30 days</Table.Th>
                    </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                    {visible.length === 0 && (
                        <Table.Tr>
                            <Table.Td colSpan={6}>
                                <Text fz="sm" c="dimmed" ta="center">
                                    Nobody matches this filter
                                </Text>
                            </Table.Td>
                        </Table.Tr>
                    )}
                    {visible.map((member) => {
                        const alsoIn = formatAlsoIn(member.sharedWith);
                        const isHighlighted =
                            member.userUuid === highlight?.userUuid;
                        return (
                            <Table.Tr
                                key={member.userUuid}
                                ref={
                                    isHighlighted
                                        ? highlightedRowRef
                                        : undefined
                                }
                                tabIndex={isHighlighted ? -1 : undefined}
                                aria-current={
                                    isHighlighted ? 'true' : undefined
                                }
                                bg={
                                    isHighlighted
                                        ? 'var(--mantine-primary-color-light)'
                                        : undefined
                                }
                            >
                                <Table.Td>
                                    <Text fz="sm" fw={500}>
                                        {`${member.firstName} ${member.lastName}`.trim()}
                                    </Text>
                                    <Text fz="xs" c="dimmed">
                                        {member.email}
                                    </Text>
                                </Table.Td>
                                <Table.Td>
                                    {OrganizationMemberRoleLabels[member.role]}
                                </Table.Td>
                                <Table.Td>
                                    <Text fz="sm">
                                        {formatMemberSource(member)}
                                    </Text>
                                    {alsoIn !== null && (
                                        <Text
                                            fz="xs"
                                            c="dimmed"
                                            title={alsoIn.title ?? undefined}
                                        >
                                            {alsoIn.text}
                                        </Text>
                                    )}
                                </Table.Td>
                                <Table.Td>
                                    {formatLastActive(member.lastActiveAt)}
                                </Table.Td>
                                <Table.Td>
                                    {formatCount(member.queries30d)}
                                </Table.Td>
                                <Table.Td>
                                    {formatCount(member.dashboardViews30d)}
                                </Table.Td>
                            </Table.Tr>
                        );
                    })}
                </Table.Tbody>
            </Table>
            {pageCount > 1 && (
                <Pagination
                    size="sm"
                    total={pageCount}
                    value={page}
                    onChange={setPage}
                />
            )}
        </Stack>
    );
};
