import {
    OrganizationMemberRoleLabels,
    type DepartmentMember,
} from '@lightdash/common';
import { Chip, Group, Pagination, Stack, Table, Text } from '@mantine/core';
import { useMemo, useState, type FC } from 'react';
import {
    countMembersByFilter,
    filterMembers,
    formatLastActive,
    formatMemberSource,
    sortMembers,
    type MemberFilter,
} from '../utils/departmentDetail';

const PAGE_SIZE = 50;

const FILTER_LABELS: Record<MemberFilter, string> = {
    all: 'All',
    noRecordedActivity: 'No recorded activity',
    inactive30d: 'Not active in 30 days',
};
const FILTERS: MemberFilter[] = ['all', 'noRecordedActivity', 'inactive30d'];

const isMemberFilter = (value: string): value is MemberFilter =>
    FILTERS.some((filter) => filter === value);

export const DepartmentMembersTable: FC<{ members: DepartmentMember[] }> = ({
    members,
}) => {
    const [filter, setFilter] = useState<MemberFilter>('all');
    const [page, setPage] = useState(1);
    const counts = useMemo(() => countMembersByFilter(members), [members]);
    const sorted = useMemo(() => sortMembers(members), [members]);
    const filtered = useMemo(
        () => filterMembers(sorted, filter),
        [sorted, filter],
    );
    const pageCount = Math.ceil(filtered.length / PAGE_SIZE);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
                            {`${FILTER_LABELS[value]} (${counts[value]})`}
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
                    {visible.map((member) => (
                        <Table.Tr key={member.userUuid}>
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
                            <Table.Td>{formatMemberSource(member)}</Table.Td>
                            <Table.Td>
                                {formatLastActive(member.lastActiveAt)}
                            </Table.Td>
                            <Table.Td>{member.queries30d}</Table.Td>
                            <Table.Td>{member.dashboardViews30d}</Table.Td>
                        </Table.Tr>
                    ))}
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
