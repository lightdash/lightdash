import {
    normalizeDepartmentName,
    type CreateDepartment,
    type DepartmentMember,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import {
    Anchor,
    Button,
    Divider,
    Drawer,
    Group,
    MultiSelect,
    ScrollArea,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
} from '@mantine/core';
import { DateInput } from '@mantine/dates';
import { useForm } from '@mantine/form';
import { useEffect, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import MantineModal from '../../../../components/common/MantineModal';
import { NumberInput } from '../../../../components/common/NumberInput';
import TruncatedText from '../../../../components/common/TruncatedText';
import { useOrganizationGroups } from '../../../../hooks/useOrganizationGroups';
import { useOrganizationUsers } from '../../../../hooks/useOrganizationUsers';
import {
    useCreateDepartment,
    useDeleteDepartment,
    useDepartmentMembership,
    useSetDepartmentGroups,
    useSetDepartmentMembers,
    useSetDepartmentOwners,
    useUpdateDepartment,
} from '../../../hooks/useOrgDepartments';
import { getDepartmentPath } from '../utils/adoptionNav';
import {
    buildDepartmentUpdate,
    cleanHeadcountNote,
    decodeOwners,
    encodeOwner,
    formatTargetDate,
    getAssignableUsers,
    getParentOptions,
    getResolvedMembers,
    getResolvedMembersFromDetail,
    HEADCOUNT_NOTE_MAX_LENGTH,
    MAX_OWNERS,
    MAX_WHOLE_NUMBER,
    NAME_MAX_LENGTH,
    TARGET_DATE_MAX,
    TARGET_DATE_MIN,
    toNullableNumber,
    validateWholeNumber,
} from '../utils/departmentForm';

type FormValues = {
    name: string;
    parentDepartmentUuid: string | null;
    headcount: number | string;
    headcountNote: string;
    targetActiveUsers: number | string;
    targetDate: string | null;
    owners: string[];
    groupUuids: string[];
    memberUuids: string[];
};

// Options and people drawn at once; pickers rely on search beyond this
const PICKER_LIMIT = 50;
const RESOLVED_MEMBER_LIMIT = 50;

type FormProps = {
    department: DepartmentWithMetrics | null;
    departments: DepartmentWithMetrics[];
    // The department's people when the caller has already loaded them, otherwise null
    members: DepartmentMember[] | null;
    onClose: () => void;
    onCreated?: (name: string) => void;
    onDeleteStart?: () => void;
    onDeleteEnd?: (succeeded: boolean) => void;
};

type SavedDepartment = { departmentUuid: string; core: CreateDepartment };

const getFullName = (person: {
    firstName: string;
    lastName: string;
    email: string;
}): string => `${person.firstName} ${person.lastName}`.trim() || person.email;

export const DepartmentForm: FC<FormProps> = ({
    department,
    departments,
    members,
    onClose,
    onCreated,
    onDeleteStart,
    onDeleteEnd,
}) => {
    const createDepartment = useCreateDepartment();
    const updateDepartment = useUpdateDepartment();
    const deleteDepartment = useDeleteDepartment();
    const setOwners = useSetDepartmentOwners();
    const setGroups = useSetDepartmentGroups();
    const setMembers = useSetDepartmentMembers();
    const { data: users = [] } = useOrganizationUsers();
    const { data: groups = [] } = useOrganizationGroups({});
    // Everyone in the organization is only fetched when the caller has no list to hand over
    const { data: membership = [] } = useDepartmentMembership(
        department !== null && members === null,
    );
    const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    // What the server holds, snapshotted on mount so a refetched prop cannot
    // change the diff. Set after a create too, so a retry updates, not creates
    const [saved, setSaved] = useState<SavedDepartment | null>(() =>
        department === null
            ? null
            : {
                  departmentUuid: department.departmentUuid,
                  core: {
                      name: department.name,
                      parentDepartmentUuid: department.parentDepartmentUuid,
                      headcount: department.headcount,
                      headcountNote: department.headcountNote,
                      targetActiveUsers: department.targetActiveUsers,
                      targetDate: department.targetDate,
                  },
              },
    );

    const form = useForm<FormValues>({
        initialValues: {
            name: department?.name ?? '',
            parentDepartmentUuid: department?.parentDepartmentUuid ?? null,
            headcount: department?.headcount ?? '',
            headcountNote: department?.headcountNote ?? '',
            targetActiveUsers: department?.targetActiveUsers ?? '',
            targetDate: department?.targetDate ?? null,
            owners: department?.owners.map(encodeOwner) ?? [],
            groupUuids: department?.linkedGroups.map((g) => g.groupUuid) ?? [],
            memberUuids: department?.explicitMemberUuids ?? [],
        },
        validate: {
            name: (value) => {
                // The name as the server compares and stores it
                const name = normalizeDepartmentName(value);
                if (name.length === 0) return 'Enter a name';
                return name.length > NAME_MAX_LENGTH
                    ? `Keep the name to ${NAME_MAX_LENGTH} characters or fewer`
                    : null;
            },
            headcount: (value) => validateWholeNumber(value, 'Headcount'),
            headcountNote: (value) =>
                value.length > HEADCOUNT_NOTE_MAX_LENGTH
                    ? `Keep the note to ${HEADCOUNT_NOTE_MAX_LENGTH} characters or fewer`
                    : null,
            targetActiveUsers: (value) =>
                validateWholeNumber(value, 'Target active users'),
        },
    });

    const alreadyChosen = useMemo(
        () =>
            new Set([
                ...(department?.explicitMemberUuids ?? []),
                ...(department?.owners ?? [])
                    .filter((owner) => owner.type === 'user')
                    .map((owner) => owner.uuid),
            ]),
        [department],
    );
    const userOptions = useMemo(
        () =>
            getAssignableUsers(users, alreadyChosen).map((user) => ({
                value: user.userUuid,
                label: getFullName(user),
            })),
        [users, alreadyChosen],
    );
    const groupOptions = useMemo(
        () => groups.map((group) => ({ value: group.uuid, label: group.name })),
        [groups],
    );
    const ownerOptions = useMemo(
        () => [
            {
                group: 'People',
                items: userOptions.map((option) => ({
                    value: encodeOwner({ type: 'user', uuid: option.value }),
                    label: option.label,
                })),
            },
            {
                group: 'Groups',
                items: groupOptions.map((option) => ({
                    value: encodeOwner({ type: 'group', uuid: option.value }),
                    label: option.label,
                })),
            },
        ],
        [userOptions, groupOptions],
    );
    const parentOptions = useMemo(
        () => getParentOptions(departments, department?.departmentUuid ?? null),
        [departments, department],
    );
    const resolvedMembers = useMemo(() => {
        if (department === null) return [];
        return members !== null
            ? getResolvedMembersFromDetail(members)
            : getResolvedMembers(
                  membership,
                  departments,
                  department.departmentUuid,
              );
    }, [members, membership, departments, department]);
    const hiddenMemberCount = Math.max(
        resolvedMembers.length - RESOLVED_MEMBER_LIMIT,
        0,
    );
    const hasSubDepartments =
        department !== null &&
        departments.some(
            (d) => d.parentDepartmentUuid === department.departmentUuid,
        );

    const handleSubmit = async (values: FormValues) => {
        const next: CreateDepartment = {
            name: normalizeDepartmentName(values.name),
            parentDepartmentUuid: values.parentDepartmentUuid,
            headcount: toNullableNumber(values.headcount),
            headcountNote: cleanHeadcountNote(values.headcountNote),
            targetActiveUsers: toNullableNumber(values.targetActiveUsers),
            targetDate: formatTargetDate(values.targetDate),
        };
        setIsSaving(true);
        try {
            let target: SavedDepartment;
            if (saved === null) {
                const created = await createDepartment.mutateAsync(next);
                target = { departmentUuid: created.departmentUuid, core: next };
                setSaved(target);
                onCreated?.(next.name);
            } else {
                const data = buildDepartmentUpdate(saved.core, next);
                if (Object.keys(data).length > 0) {
                    await updateDepartment.mutateAsync({
                        departmentUuid: saved.departmentUuid,
                        data,
                    });
                }
                target = { departmentUuid: saved.departmentUuid, core: next };
                setSaved(target);
            }
            const { departmentUuid } = target;
            if (form.isDirty('owners')) {
                await setOwners.mutateAsync({
                    departmentUuid,
                    owners: decodeOwners(values.owners),
                });
            }
            if (form.isDirty('groupUuids')) {
                await setGroups.mutateAsync({
                    departmentUuid,
                    groupUuids: values.groupUuids,
                });
            }
            if (form.isDirty('memberUuids')) {
                await setMembers.mutateAsync({
                    departmentUuid,
                    userUuids: values.memberUuids,
                });
            }
            onClose();
        } catch {
            // The failing mutation already showed a toast; keep the form open
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        if (department === null || deleteDepartment.isLoading) return;
        onDeleteStart?.();
        try {
            await deleteDepartment.mutateAsync(department.departmentUuid);
            onClose();
            onDeleteEnd?.(true);
        } catch {
            onDeleteEnd?.(false);
            // The failure toast is shown by the hook; the confirmation stays open to retry or cancel
        }
    };

    return (
        <>
            <form onSubmit={form.onSubmit(handleSubmit)}>
                <Stack gap="md">
                    <TextInput
                        label="Name"
                        placeholder="Supply chain"
                        withAsterisk
                        {...form.getInputProps('name')}
                    />
                    <Select
                        label="Parent department"
                        description="Leave empty for a top-level department"
                        placeholder="None"
                        data={parentOptions}
                        clearable
                        searchable
                        {...form.getInputProps('parentDepartmentUuid')}
                    />
                    <NumberInput
                        label="Headcount"
                        description="How many people work in this department. Leave empty to add up its sub-departments"
                        min={0}
                        max={MAX_WHOLE_NUMBER}
                        allowNegative={false}
                        {...form.getInputProps('headcount')}
                    />
                    <Textarea
                        label="Headcount note"
                        description="Say who the headcount covers, for example store managers only"
                        autosize
                        minRows={2}
                        maxLength={HEADCOUNT_NOTE_MAX_LENGTH}
                        {...form.getInputProps('headcountNote')}
                    />
                    <MultiSelect
                        label="Owners"
                        description="People or groups responsible for this rollout. The first one is shown in the table"
                        placeholder="Add a person or group"
                        data={ownerOptions}
                        limit={PICKER_LIMIT}
                        maxValues={MAX_OWNERS}
                        searchable
                        clearable
                        {...form.getInputProps('owners')}
                    />
                    <Group grow align="flex-start">
                        <NumberInput
                            label="Target active users"
                            min={0}
                            max={MAX_WHOLE_NUMBER}
                            allowNegative={false}
                            {...form.getInputProps('targetActiveUsers')}
                        />
                        <DateInput
                            label="Target date"
                            valueFormat="D MMM YYYY"
                            minDate={TARGET_DATE_MIN}
                            maxDate={TARGET_DATE_MAX}
                            clearable
                            {...form.getInputProps('targetDate')}
                        />
                    </Group>

                    <Divider
                        label="Who is in this department"
                        labelPosition="left"
                    />
                    <MultiSelect
                        label="Linked groups"
                        description="Everyone in these groups counts towards this department"
                        placeholder="Add a group"
                        data={groupOptions}
                        limit={PICKER_LIMIT}
                        searchable
                        clearable
                        {...form.getInputProps('groupUuids')}
                    />
                    <MultiSelect
                        label="Assigned people"
                        description="Assigning someone here overrides their groups"
                        placeholder="Add a person"
                        data={userOptions}
                        limit={PICKER_LIMIT}
                        searchable
                        clearable
                        {...form.getInputProps('memberUuids')}
                    />

                    {department !== null && (
                        <Stack gap="xs">
                            <Text fz="sm" fw={500}>
                                {resolvedMembers.length === 1
                                    ? '1 person in this department'
                                    : `${resolvedMembers.length} people in this department`}
                            </Text>
                            <ScrollArea.Autosize mah={220}>
                                <Stack gap="xs">
                                    {resolvedMembers
                                        .slice(0, RESOLVED_MEMBER_LIMIT)
                                        .map(({ member, via }) => (
                                            <Group
                                                key={member.userUuid}
                                                justify="space-between"
                                                wrap="nowrap"
                                            >
                                                <TruncatedText maxWidth="70%">
                                                    {getFullName(member)}
                                                </TruncatedText>
                                                <Text fz="xs" c="dimmed">
                                                    {via === null
                                                        ? 'Direct'
                                                        : `Via ${via}`}
                                                </Text>
                                            </Group>
                                        ))}
                                </Stack>
                            </ScrollArea.Autosize>
                            {hiddenMemberCount > 0 &&
                                (members !== null ? (
                                    <Text fz="xs" c="dimmed">
                                        {`Showing ${RESOLVED_MEMBER_LIMIT} of ${resolvedMembers.length.toLocaleString('en-US')}, everyone is listed under People on this page`}
                                    </Text>
                                ) : (
                                    <Anchor
                                        component={Link}
                                        to={getDepartmentPath(
                                            department.departmentUuid,
                                        )}
                                        fz="xs"
                                    >
                                        {`Showing ${RESOLVED_MEMBER_LIMIT} of ${resolvedMembers.length.toLocaleString('en-US')}, see everyone on the department page`}
                                    </Anchor>
                                ))}
                        </Stack>
                    )}

                    <Group justify="space-between" mt="md">
                        {department !== null ? (
                            <Button
                                variant="subtle"
                                color="red"
                                onClick={() => setIsConfirmingDelete(true)}
                            >
                                Delete department
                            </Button>
                        ) : (
                            <span />
                        )}
                        <Group gap="xs">
                            <Button variant="default" onClick={onClose}>
                                Cancel
                            </Button>
                            <Button type="submit" loading={isSaving}>
                                {saved === null
                                    ? 'Create department'
                                    : 'Save changes'}
                            </Button>
                        </Group>
                    </Group>
                </Stack>
            </form>

            {department !== null && (
                <MantineModal
                    opened={isConfirmingDelete}
                    onClose={() => setIsConfirmingDelete(false)}
                    variant="delete"
                    resourceType="department"
                    resourceLabel={department.name}
                    title={`Delete ${department.name}`}
                    size="md"
                    confirmLabel="Delete department"
                    confirmLoading={deleteDepartment.isLoading}
                    onConfirm={handleDelete}
                >
                    <Stack gap="xs">
                        {hasSubDepartments && (
                            <Text fz="sm">
                                Its sub-departments move up one level.
                            </Text>
                        )}
                        <Text fz="sm">
                            Linked groups and assigned people are released.
                            Nobody loses access.
                        </Text>
                    </Stack>
                </MantineModal>
            )}
        </>
    );
};

type DrawerProps = FormProps & { opened: boolean };

export const DepartmentDrawer: FC<DrawerProps> = ({
    opened,
    onClose,
    department,
    departments,
    members,
    onDeleteStart,
    onDeleteEnd,
}) => {
    const [createdName, setCreatedName] = useState<string | null>(null);
    useEffect(() => {
        if (!opened) setCreatedName(null);
    }, [opened]);
    return (
        <Drawer
            opened={opened}
            onClose={onClose}
            position="right"
            size="lg"
            title={
                department === null && createdName === null
                    ? 'New department'
                    : `Edit ${department?.name ?? createdName}`
            }
        >
            {opened && (
                <DepartmentForm
                    key={department?.departmentUuid ?? 'new'}
                    department={department}
                    departments={departments}
                    members={members}
                    onClose={onClose}
                    onCreated={setCreatedName}
                    onDeleteStart={onDeleteStart}
                    onDeleteEnd={onDeleteEnd}
                />
            )}
        </Drawer>
    );
};
