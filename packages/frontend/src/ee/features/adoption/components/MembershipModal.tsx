import {
    type DepartmentMembership,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import {
    Badge,
    Checkbox,
    Group,
    Select,
    Stack,
    Tabs,
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
    useSetPrimaryDepartment,
} from '../../../hooks/useOrgDepartments';
import {
    countAttentionNames,
    getMemberName,
    getPlacement,
    getSharedRows,
    getUnassignedRows,
    parseMembershipTab,
    searchAttentionRows,
    type MembershipTab,
    type SharedRow,
} from '../utils/attention';
import { getParentOptions } from '../utils/departmentForm';
import { formatCount } from '../utils/format';

// Rows drawn at once; a large organization narrows the list by searching
const VISIBLE_ROW_LIMIT = 50;
// Selects keep this width while the modal has room, and shrink to the minimum on a narrow screen
const SELECT_FLEX = '0 1 260px';
const SELECT_MIN_WIDTH = 160;
// The person takes the rest of the row, so every select lines up
const PERSON_MIN_WIDTH = 120;
// The "Counts in" choice that clears the person's primary department
const EVERYWHERE = 'everywhere';

type Props = {
    opened: boolean;
    tab: MembershipTab;
    onTabChange: (tab: MembershipTab) => void;
    onClose: () => void;
    departments: DepartmentWithMetrics[];
};

// Two people with one name are told apart by email
const getWho = (
    member: DepartmentMembership,
    nameCounts: Map<string, number>,
): string => {
    const name = getMemberName(member);
    return (nameCounts.get(name) ?? 0) > 1 ? `${name} (${member.email})` : name;
};

type SharedPersonRowProps = {
    row: SharedRow;
    who: string;
    countsIn: string; // a department uuid, or EVERYWHERE
    disabled: boolean;
    onCountsInChange: (value: string | null) => void;
};

// A person in more than one department: their departments as chips, and where they count
const SharedPersonRow: FC<SharedPersonRowProps> = ({
    row,
    who,
    countsIn,
    disabled,
    onCountsInChange,
}) => (
    <Group
        role="group"
        aria-label={who}
        justify="space-between"
        wrap="nowrap"
        gap="md"
    >
        <Stack gap={2} flex={1} miw={PERSON_MIN_WIDTH}>
            <Text fz="sm" fw={500} truncate>
                {getMemberName(row.member)}
            </Text>
            <Text fz="xs" c="dimmed" truncate>
                {row.member.email}
            </Text>
            <Group
                role="list"
                aria-label={`Departments ${who} is in`}
                gap={4}
                mt={4}
            >
                {row.departments.map((department) => (
                    <Badge
                        key={department.departmentUuid}
                        role="listitem"
                        maw="100%"
                    >
                        {department.name}
                    </Badge>
                ))}
            </Group>
        </Stack>
        <Select
            label="Counts in"
            aria-label={`Counts in for ${who}`}
            data={[
                { value: EVERYWHERE, label: 'Everywhere' },
                ...row.departments.map((department) => ({
                    value: department.departmentUuid,
                    label: department.name,
                })),
            ]}
            allowDeselect={false}
            flex={SELECT_FLEX}
            miw={SELECT_MIN_WIDTH}
            disabled={disabled}
            value={countsIn}
            onChange={onCountsInChange}
        />
    </Group>
);

export const MembershipModal: FC<Props> = ({
    opened,
    tab,
    onTabChange,
    onClose,
    departments,
}) => {
    const { data: membership = [], isInitialLoading } =
        useDepartmentMembership(opened);
    const setMembers = useSetDepartmentMembers();
    const setPrimary = useSetPrimaryDepartment();
    // One search for both tabs, so switching tab keeps the people looked for
    const [search, setSearch] = useState('');
    // Kept while searching, so people found by different searches can be placed together
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const rows = useMemo(() => getUnassignedRows(membership), [membership]);
    const nameCounts = useMemo(() => countAttentionNames(rows), [rows]);
    const matching = useMemo(
        () => searchAttentionRows(rows, search),
        [rows, search],
    );
    const visible = matching.slice(0, VISIBLE_ROW_LIMIT);
    const sharedRows = useMemo(
        () => getSharedRows(membership, departments),
        [membership, departments],
    );
    const sharedNameCounts = useMemo(
        () => countAttentionNames(sharedRows),
        [sharedRows],
    );
    const sharedMatching = useMemo(
        () => searchAttentionRows(sharedRows, search),
        [sharedRows, search],
    );
    const sharedVisible = sharedMatching.slice(0, VISIBLE_ROW_LIMIT);
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
    // Selected people the list does not show are placed too, so say how many there are
    const hiddenSelectedCount = selectedUuids.filter(
        (userUuid) => !visibleUuids.includes(userUuid),
    ).length;
    const selectionLabel =
        hiddenSelectedCount === 0
            ? `${formatCount(selectedUuids.length)} selected`
            : `${formatCount(selectedUuids.length)} selected, ${formatCount(hiddenSelectedCount)} ${search.trim().length > 0 ? 'hidden by search' : 'not shown'}`;

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
    const countIn = ({ member }: SharedRow, value: string | null) => {
        if (value === null) return;
        const departmentUuid = value === EVERYWHERE ? null : value;
        if (departmentUuid === member.primaryDepartmentUuid) return;
        setPrimary.mutate({ userUuid: member.userUuid, departmentUuid });
    };
    // The choice being saved shows at once; the list refreshes before the save completes
    const getCountsIn = ({ member }: SharedRow): string => {
        const saving = setPrimary.isLoading ? setPrimary.variables : undefined;
        const departmentUuid =
            saving !== undefined && saving.userUuid === member.userUuid
                ? saving.departmentUuid
                : member.primaryDepartmentUuid;
        return departmentUuid ?? EVERYWHERE;
    };
    const close = () => {
        setSelected(new Set());
        onClose();
    };

    const searchInput = (
        <TextInput
            aria-label="Search people"
            placeholder="Search by name or email"
            leftSection={<MantineIcon icon={IconSearch} />}
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
        />
    );
    const loading = (
        <Text fz="sm" c="dimmed">
            Loading people
        </Text>
    );
    const noMatch = (
        <Text fz="sm" c="dimmed">
            Nobody matches this search
        </Text>
    );
    const showing = (shown: number, total: number) =>
        total > shown && (
            <Text fz="sm" c="dimmed">
                {`Showing ${formatCount(shown)} of ${formatCount(total)}, search to narrow`}
            </Text>
        );

    return (
        <MantineModal
            opened={opened}
            onClose={close}
            title="Place people"
            size="xl"
        >
            <Tabs
                value={tab}
                onChange={(value) => onTabChange(parseMembershipTab(value))}
                keepMounted={false}
            >
                <Tabs.List>
                    <Tabs.Tab value="unassigned">Unassigned</Tabs.Tab>
                    <Tabs.Tab value="shared">Shared</Tabs.Tab>
                </Tabs.List>
                <Tabs.Panel value="unassigned" pt="md">
                    <Stack gap="sm">
                        {isInitialLoading && loading}
                        {!isInitialLoading && rows.length === 0 && (
                            <Text fz="sm" c="dimmed">
                                Everyone is in a department
                            </Text>
                        )}
                        {rows.length > 0 && searchInput}
                        {rows.length > 0 && (
                            <Group
                                justify="space-between"
                                align="flex-end"
                                wrap="nowrap"
                            >
                                <Group gap="sm" flex={1} miw={PERSON_MIN_WIDTH}>
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
                                    {/* Always present, so a screen reader announces each change to the count */}
                                    <Text
                                        fz="sm"
                                        c="dimmed"
                                        role="status"
                                        aria-live="polite"
                                    >
                                        {selectedUuids.length > 0
                                            ? selectionLabel
                                            : null}
                                    </Text>
                                </Group>
                                <Select
                                    label="Place selected in"
                                    placeholder="Choose a department"
                                    data={departmentOptions}
                                    searchable
                                    flex={SELECT_FLEX}
                                    miw={SELECT_MIN_WIDTH}
                                    disabled={
                                        selectedUuids.length === 0 ||
                                        setMembers.isLoading
                                    }
                                    value={null}
                                    onChange={assignSelected}
                                />
                            </Group>
                        )}
                        {rows.length > 0 && matching.length === 0 && noMatch}
                        {visible.map(({ member }) => {
                            const who = getWho(member, nameCounts);
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
                                        flex={1}
                                        miw={PERSON_MIN_WIDTH}
                                    >
                                        <Checkbox
                                            aria-label={`Select ${who}`}
                                            checked={selected.has(
                                                member.userUuid,
                                            )}
                                            onChange={() =>
                                                toggle(member.userUuid)
                                            }
                                        />
                                        <Stack gap={2} miw={0}>
                                            <Text fz="sm" fw={500} truncate>
                                                {getMemberName(member)}
                                            </Text>
                                            <Text fz="xs" c="dimmed" truncate>
                                                {member.email}
                                            </Text>
                                        </Stack>
                                    </Group>
                                    <Select
                                        label={`Department for ${who}`}
                                        placeholder="Choose a department"
                                        data={departmentOptions}
                                        searchable
                                        flex={SELECT_FLEX}
                                        miw={SELECT_MIN_WIDTH}
                                        disabled={setMembers.isLoading}
                                        value={null}
                                        onChange={(value) =>
                                            assign(member.userUuid, value)
                                        }
                                    />
                                </Group>
                            );
                        })}
                        {showing(visible.length, matching.length)}
                    </Stack>
                </Tabs.Panel>
                <Tabs.Panel value="shared" pt="md">
                    <Stack gap="sm">
                        {isInitialLoading && loading}
                        {!isInitialLoading && sharedRows.length === 0 && (
                            <Text fz="sm" c="dimmed">
                                Nobody is in more than one department
                            </Text>
                        )}
                        {sharedRows.length > 0 && searchInput}
                        {sharedRows.length > 0 &&
                            sharedMatching.length === 0 &&
                            noMatch}
                        {sharedVisible.map((row) => (
                            <SharedPersonRow
                                key={row.member.userUuid}
                                row={row}
                                who={getWho(row.member, sharedNameCounts)}
                                countsIn={getCountsIn(row)}
                                disabled={setPrimary.isLoading}
                                onCountsInChange={(value) =>
                                    countIn(row, value)
                                }
                            />
                        ))}
                        {showing(sharedVisible.length, sharedMatching.length)}
                    </Stack>
                </Tabs.Panel>
            </Tabs>
        </MantineModal>
    );
};
