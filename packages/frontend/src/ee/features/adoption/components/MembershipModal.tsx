import { type DepartmentWithMetrics } from '@lightdash/common';
import { Badge, Group, Select, Stack, Text, TextInput } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useDepartmentMembership,
    useSetDepartmentMembers,
} from '../../../hooks/useOrgDepartments';
import {
    countAttentionNames,
    getAttentionRows,
    getMemberName,
    searchAttentionRows,
} from '../utils/attention';
import { getParentOptions } from '../utils/departmentForm';

// Rows drawn at once; a large organization narrows the list by searching
const VISIBLE_ROW_LIMIT = 50;

type Props = {
    opened: boolean;
    onClose: () => void;
    departments: DepartmentWithMetrics[];
};

export const MembershipModal: FC<Props> = ({
    opened,
    onClose,
    departments,
}) => {
    const { data: membership = [], isInitialLoading } =
        useDepartmentMembership(opened);
    const setMembers = useSetDepartmentMembers();
    const [search, setSearch] = useState('');
    const rows = useMemo(
        () => getAttentionRows(membership, departments),
        [membership, departments],
    );
    const nameCounts = useMemo(() => countAttentionNames(rows), [rows]);
    const matching = useMemo(
        () => searchAttentionRows(rows, search),
        [rows, search],
    );
    const visible = matching.slice(0, VISIBLE_ROW_LIMIT);
    const departmentOptions = useMemo(
        () => getParentOptions(departments, null),
        [departments],
    );

    const assign = (userUuid: string, departmentUuid: string | null) => {
        const department = departments.find(
            (d) => d.departmentUuid === departmentUuid,
        );
        if (!department) return;
        // The endpoint replaces the explicit list, so send the current one plus this person
        setMembers.mutate({
            departmentUuid: department.departmentUuid,
            userUuids: [
                ...department.explicitMemberUuids.filter(
                    (uuid) => uuid !== userUuid,
                ),
                userUuid,
            ],
        });
    };

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title="Place people in a department"
            size="xl"
        >
            <Stack gap="sm">
                {isInitialLoading && (
                    <Text fz="sm" c="dimmed">
                        Loading people
                    </Text>
                )}
                {!isInitialLoading && rows.length === 0 && (
                    <Text fz="sm" c="dimmed">
                        Everyone is placed in one department
                    </Text>
                )}
                {rows.length > 0 && (
                    <TextInput
                        aria-label="Search people"
                        placeholder="Search by name or email"
                        leftSection={<MantineIcon icon={IconSearch} />}
                        value={search}
                        onChange={(event) =>
                            setSearch(event.currentTarget.value)
                        }
                    />
                )}
                {rows.length > 0 && matching.length === 0 && (
                    <Text fz="sm" c="dimmed">
                        Nobody matches this search
                    </Text>
                )}
                {visible.map(({ member, kind, candidateNames }) => {
                    const name = getMemberName(member);
                    const isDuplicateName = (nameCounts.get(name) ?? 0) > 1;
                    return (
                        <Group
                            key={member.userUuid}
                            justify="space-between"
                            wrap="nowrap"
                        >
                            <Stack gap={2} miw={0}>
                                <Text fz="sm" fw={500} truncate>
                                    {name}
                                </Text>
                                <Text fz="xs" c="dimmed" truncate>
                                    {member.email}
                                </Text>
                            </Stack>
                            <Group gap="xs" wrap="nowrap">
                                <Badge
                                    variant="light"
                                    color={
                                        kind === 'conflict' ? 'orange' : 'gray'
                                    }
                                >
                                    {kind === 'unassigned'
                                        ? 'No department'
                                        : candidateNames.length > 0
                                          ? `In ${candidateNames.join(' and ')}`
                                          : 'In more than one department'}
                                </Badge>
                                <Select
                                    label={`Department for ${name}${isDuplicateName ? ` (${member.email})` : ''}`}
                                    placeholder="Choose a department"
                                    data={departmentOptions}
                                    searchable
                                    w={260}
                                    disabled={setMembers.isLoading}
                                    value={null}
                                    onChange={(value) =>
                                        assign(member.userUuid, value)
                                    }
                                />
                            </Group>
                        </Group>
                    );
                })}
                {matching.length > visible.length && (
                    <Text fz="sm" c="dimmed">
                        {`Showing ${visible.length.toLocaleString('en-US')} of ${matching.length.toLocaleString('en-US')}, search to narrow`}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};
