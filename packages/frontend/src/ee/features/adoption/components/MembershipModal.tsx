import { type DepartmentWithMetrics } from '@lightdash/common';
import { Badge, Group, Select, Stack, Text } from '@mantine/core';
import { useMemo, type FC } from 'react';
import MantineModal from '../../../../components/common/MantineModal';
import {
    useDepartmentMembership,
    useSetDepartmentMembers,
} from '../../../hooks/useOrgDepartments';
import { getAttentionRows } from '../utils/attention';
import { getParentOptions } from '../utils/departmentForm';

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
    const rows = useMemo(
        () => getAttentionRows(membership, departments),
        [membership, departments],
    );
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
                {rows.map(({ member, kind, candidateNames }) => {
                    const name =
                        `${member.firstName} ${member.lastName}`.trim() ||
                        member.email;
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
                                    {kind === 'conflict'
                                        ? `In ${candidateNames.join(' and ')}`
                                        : 'No department'}
                                </Badge>
                                <Select
                                    label={`Department for ${name}`}
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
            </Stack>
        </MantineModal>
    );
};
