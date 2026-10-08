import { type DepartmentWithMetrics } from '@lightdash/common';
import {
    Badge,
    Checkbox,
    Group,
    Select,
    Stack,
    Text,
    TextInput,
} from '@mantine/core';
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
    describeConflict,
    getAttentionRows,
    getMemberName,
    getPlacement,
    searchAttentionRows,
} from '../utils/attention';
import { getParentOptions } from '../utils/departmentForm';
import { formatCount, formatQuantity, PEOPLE } from '../utils/format';

// Rows drawn at once; a large organization narrows the list by searching
const VISIBLE_ROW_LIMIT = 50;
const SELECT_WIDTH = 260;

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
    // Kept while searching, so people found by different searches can be placed together
    const [selected, setSelected] = useState<Set<string>>(new Set());
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
    // Only people still waiting for a department, in the order they are listed
    const selectedUuids = rows
        .map((row) => row.member.userUuid)
        .filter((userUuid) => selected.has(userUuid));
    const visibleUuids = visible.map((row) => row.member.userUuid);
    const visibleSelectedCount = visibleUuids.filter((userUuid) =>
        selected.has(userUuid),
    ).length;
    const isEveryoneShownSelected =
        visibleUuids.length > 0 && visibleSelectedCount === visibleUuids.length;

    const toggle = (userUuid: string) =>
        setSelected((previous) => {
            const next = new Set(previous);
            if (next.has(userUuid)) next.delete(userUuid);
            else next.add(userUuid);
            return next;
        });
    const toggleEveryoneShown = () =>
        setSelected((previous) => {
            const next = new Set(previous);
            visibleUuids.forEach((userUuid) => {
                if (isEveryoneShownSelected) next.delete(userUuid);
                else next.add(userUuid);
            });
            return next;
        });

    const assign = (userUuid: string, departmentUuid: string | null) => {
        if (departmentUuid === null) return;
        const placement = getPlacement(departments, departmentUuid, [userUuid]);
        if (placement !== null) setMembers.mutate(placement);
    };
    // Everyone selected goes in one request, so no placement can overwrite another
    const assignSelected = (departmentUuid: string | null) => {
        if (departmentUuid === null || selectedUuids.length === 0) return;
        const placement = getPlacement(
            departments,
            departmentUuid,
            selectedUuids,
        );
        if (placement === null) return;
        setMembers.mutate(placement, {
            // Anyone ticked while the request ran stays selected
            onSuccess: () =>
                setSelected((previous) => {
                    const next = new Set(previous);
                    selectedUuids.forEach((userUuid) => next.delete(userUuid));
                    return next;
                }),
        });
    };
    const close = () => {
        setSelected(new Set());
        onClose();
    };

    return (
        <MantineModal
            opened={opened}
            onClose={close}
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
                {rows.length > 0 && (
                    <Group
                        justify="space-between"
                        align="flex-end"
                        wrap="nowrap"
                    >
                        <Group gap="sm" wrap="nowrap">
                            <Checkbox
                                label="Select all shown"
                                checked={isEveryoneShownSelected}
                                indeterminate={
                                    visibleSelectedCount > 0 &&
                                    !isEveryoneShownSelected
                                }
                                disabled={visibleUuids.length === 0}
                                onChange={toggleEveryoneShown}
                            />
                            {selectedUuids.length > 0 && (
                                <Text fz="sm" c="dimmed">
                                    {`${formatQuantity(selectedUuids.length, PEOPLE)} selected`}
                                </Text>
                            )}
                        </Group>
                        <Select
                            label="Place selected in"
                            placeholder="Choose a department"
                            data={departmentOptions}
                            searchable
                            w={SELECT_WIDTH}
                            flex="none"
                            disabled={
                                selectedUuids.length === 0 ||
                                setMembers.isLoading
                            }
                            value={null}
                            onChange={assignSelected}
                        />
                    </Group>
                )}
                {rows.length > 0 && matching.length === 0 && (
                    <Text fz="sm" c="dimmed">
                        Nobody matches this search
                    </Text>
                )}
                {visible.map(({ member, kind, candidates }) => {
                    const name = getMemberName(member);
                    // Two people with one name are told apart by email
                    const who =
                        (nameCounts.get(name) ?? 0) > 1
                            ? `${name} (${member.email})`
                            : name;
                    const conflictLines = describeConflict(candidates);
                    return (
                        <Group
                            key={member.userUuid}
                            justify="space-between"
                            wrap="nowrap"
                            gap="md"
                        >
                            <Group
                                gap="sm"
                                wrap="nowrap"
                                align="flex-start"
                                miw={0}
                            >
                                <Checkbox
                                    aria-label={`Select ${who}`}
                                    checked={selected.has(member.userUuid)}
                                    onChange={() => toggle(member.userUuid)}
                                />
                                <Stack gap={2} miw={0}>
                                    <Group gap="xs" wrap="nowrap" miw={0}>
                                        <Text fz="sm" fw={500} truncate>
                                            {name}
                                        </Text>
                                        <Badge
                                            variant="light"
                                            color={
                                                kind === 'conflict'
                                                    ? 'orange'
                                                    : 'gray'
                                            }
                                            flex="none"
                                        >
                                            {kind === 'conflict'
                                                ? 'In more than one department'
                                                : 'No department'}
                                        </Badge>
                                    </Group>
                                    <Text fz="xs" c="dimmed" truncate>
                                        {member.email}
                                    </Text>
                                    {conflictLines.length > 0 && (
                                        <Stack gap={0} mt={4}>
                                            {conflictLines.map((line) => (
                                                <Text key={line} fz="xs">
                                                    {line}
                                                </Text>
                                            ))}
                                        </Stack>
                                    )}
                                </Stack>
                            </Group>
                            <Select
                                label={`Department for ${who}`}
                                placeholder="Choose a department"
                                data={departmentOptions}
                                searchable
                                w={SELECT_WIDTH}
                                flex="none"
                                disabled={setMembers.isLoading}
                                value={null}
                                onChange={(value) =>
                                    assign(member.userUuid, value)
                                }
                            />
                        </Group>
                    );
                })}
                {matching.length > visible.length && (
                    <Text fz="sm" c="dimmed">
                        {`Showing ${formatCount(visible.length)} of ${formatCount(matching.length)}, search to narrow`}
                    </Text>
                )}
            </Stack>
        </MantineModal>
    );
};
