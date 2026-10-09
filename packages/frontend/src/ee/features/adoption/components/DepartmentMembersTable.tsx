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
    // The person picked on the map, whose row is marked for as long as they stay picked
    markedUserUuid: string | null;
    // A pick not yet shown: the table puts their row on screen, scrolls to it and focuses it, then reports it shown
    reveal: PersonHighlight | null;
    onRevealed: (request: number) => void;
};

export const DepartmentMembersTable: FC<Props> = ({
    members,
    markedUserUuid,
    reveal,
    onRevealed,
}) => {
    const [filter, setFilter] = useState<MemberFilter>('all');
    const [page, setPage] = useState(1);
    const counts = useMemo(() => countMembersByFilter(members), [members]);
    const sorted = useMemo(() => sortMembers(members), [members]);
    // A pick to reveal is shown on its page, under the filter chosen if it holds them and under All if not
    const [shownRequest, setShownRequest] = useState<number | null>(null);
    if (reveal !== null && reveal.request !== shownRequest) {
        setShownRequest(reveal.request);
        const indexIn = (each: MemberFilter) =>
            filterMembers(sorted, each).findIndex(
                (member) => member.userUuid === reveal.userUuid,
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
    // The row is brought into view and takes focus, so the keyboard and a screen reader land on the person too.
    // Reported once done, so a table shown again later, for an overlap, leaves the page and focus alone
    const markedRowRef = useRef<HTMLTableRowElement | null>(null);
    const revealRequest = reveal?.request ?? null;
    useEffect(() => {
        if (revealRequest === null) return;
        const row = markedRowRef.current;
        if (row !== null) {
            row.scrollIntoView({ block: 'center' });
            row.focus({ preventScroll: true });
        }
        onRevealed(revealRequest);
    }, [revealRequest, onRevealed]);

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
                        const isMarked = member.userUuid === markedUserUuid;
                        return (
                            <Table.Tr
                                key={member.userUuid}
                                ref={isMarked ? markedRowRef : undefined}
                                tabIndex={isMarked ? -1 : undefined}
                                aria-current={isMarked ? 'true' : undefined}
                                bg={
                                    isMarked
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
