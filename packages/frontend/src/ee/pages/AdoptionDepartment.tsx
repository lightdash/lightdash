import { subject } from '@casl/ability';
import { type DepartmentMember } from '@lightdash/common';
import {
    Anchor,
    Button,
    Group,
    Pill,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { validate as isUuid } from 'uuid';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import InlineErrorState from '../../components/common/InlineErrorState';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../providers/App/useApp';
import { DepartmentDrawer } from '../features/adoption/components/DepartmentDrawer';
import { DepartmentMembersTable } from '../features/adoption/components/DepartmentMembersTable';
import { OverlapsSection } from '../features/adoption/components/OverlapsSection';
import { StatTile } from '../features/adoption/components/StatTile';
import { TopContentList } from '../features/adoption/components/TopContentList';
import { WeeklyActiveChart } from '../features/adoption/components/WeeklyActiveChart';
import {
    ADOPTION_PATH,
    getDepartmentPath,
} from '../features/adoption/utils/adoptionNav';
import {
    getActiveCaption,
    getCoverageCaption,
    getOverlapSelectionKey,
    getOverlapSelectionLabel,
    getWeeklyComparison,
    type OverlapSelection,
} from '../features/adoption/utils/departmentDetail';
import {
    formatShare,
    getMissingHeadcountWord,
    sortByCoverage,
} from '../features/adoption/utils/departmentRows';
import { type Noun } from '../features/adoption/utils/format';
import {
    useDepartmentDetail,
    useDepartmentOverlaps,
    useOrgAdoptionSummary,
} from '../hooks/useOrgDepartments';

const VIEWS: Noun = { one: 'view', other: 'views' };
const QUERIES: Noun = { one: 'query', other: 'queries' };
const PROMPTS: Noun = { one: 'prompt', other: 'prompts' };

const BackToAdoption: FC = () => (
    <Button component={Link} to={ADOPTION_PATH} variant="default">
        Back to adoption
    </Button>
);

const getUnavailableCopy = (
    statusCode: number | undefined,
    message: string | undefined,
): { title: string; description: string | undefined } => {
    if (statusCode === 404) {
        return {
            title: 'Department not found',
            description:
                'It may have been deleted, or it may not be in your organization',
        };
    }
    if (statusCode === 403) {
        return {
            title: "You don't have access to this department",
            description: 'Ask an admin if you think you should',
        };
    }
    return { title: "This department isn't available", description: message };
};

type OverlapPeopleProps = {
    label: string; // what the people are narrowed to
    people: DepartmentMember[] | null; // null until loaded
    isError: boolean;
    onRetry: () => void;
    onClear: () => void;
};

// The department's people narrowed to one overlap, under a chip that brings everyone back
const OverlapPeople: FC<OverlapPeopleProps> = ({
    label,
    people,
    isError,
    onRetry,
    onClear,
}) => {
    const renderPeople = () => {
        if (people !== null) {
            return people.length === 0 ? (
                <Text fz="sm" c="dimmed">
                    Nobody matches this filter
                </Text>
            ) : (
                <DepartmentMembersTable members={people} />
            );
        }
        return isError ? (
            <InlineErrorState
                message="These people couldn't be loaded"
                onRetry={onRetry}
            />
        ) : (
            <EmptyStateLoader title="Loading people" />
        );
    };
    return (
        <Stack gap="sm">
            <Group>
                <Pill
                    withRemoveButton
                    onRemove={onClear}
                    removeButtonProps={{
                        'aria-label': `Clear filter: ${label}`,
                        'aria-hidden': false,
                        tabIndex: 0,
                    }}
                >
                    {label}
                </Pill>
            </Group>
            {renderPeople()}
        </Stack>
    );
};

const AdoptionDepartment: FC = () => {
    const { departmentUuid: routeDepartmentUuid } = useParams<{
        departmentUuid: string;
    }>();
    // Only a real uuid reaches the API; anything else is a department that does not exist
    const departmentUuid =
        routeDepartmentUuid !== undefined && isUuid(routeDepartmentUuid)
            ? routeDepartmentUuid
            : undefined;
    const { user } = useApp();
    const canManage =
        user.data?.ability.can(
            'manage',
            subject('OrganizationAdoption', {
                organizationUuid: user.data.organizationUuid,
            }),
        ) ?? false;
    const detail = useDepartmentDetail(departmentUuid);
    // The weekly comparison needs the organization's numbers; the drawer's parent picker needs every department
    const summary = useOrgAdoptionSummary(departmentUuid !== undefined);
    const overlaps = useDepartmentOverlaps(departmentUuid);
    // Kept with the department it was chosen on, so another department's page starts with everyone
    const [chosenOverlap, setChosenOverlap] = useState<{
        departmentUuid: string;
        selection: OverlapSelection;
    } | null>(null);
    const selection =
        chosenOverlap !== null &&
        chosenOverlap.departmentUuid === departmentUuid
            ? chosenOverlap.selection
            : null;
    const selectOverlap = (next: OverlapSelection | null) =>
        setChosenOverlap(
            next === null || departmentUuid === undefined
                ? null
                : { departmentUuid, selection: next },
        );
    // Nobody's people are asked for until an overlap is chosen
    const overlapPeople = useDepartmentOverlaps(
        selection === null ? undefined : departmentUuid,
        selection?.withDepartments.map((d) => d.departmentUuid) ?? [],
        selection?.withoutDepartments.map((d) => d.departmentUuid) ?? [],
    );
    const [isEditing, setIsEditing] = useState(false);
    // While a delete is in flight the refetch returns 404; keep the last page until we leave
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();
    const weeks = useMemo(
        () =>
            detail.data
                ? getWeeklyComparison(
                      detail.data.weeklyActive,
                      detail.data.department.metrics.memberCount,
                      summary.data?.organization ?? null,
                  )
                : [],
        [detail.data, summary.data],
    );

    if (departmentUuid === undefined) {
        const { title, description } = getUnavailableCopy(404, undefined);
        return (
            <SettingsPage title="Department">
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={title}
                    description={description}
                    action={<BackToAdoption />}
                />
            </SettingsPage>
        );
    }
    if (detail.isInitialLoading) {
        return (
            <SettingsPage title="Department">
                <EmptyStateLoader />
            </SettingsPage>
        );
    }
    if ((detail.isError && !isDeleting) || !detail.data) {
        const { title, description } = getUnavailableCopy(
            detail.error?.error.statusCode,
            detail.error?.error.message,
        );
        return (
            <SettingsPage title="Department">
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={title}
                    description={description}
                    action={<BackToAdoption />}
                />
            </SettingsPage>
        );
    }

    const { department, ancestors, children, members, topContent } =
        detail.data;
    const { metrics } = department;
    // Without a headcount the people on Lightdash are all that is counted, so the captions give that count
    const headcount = department.hasHeadcount
        ? department.effectiveHeadcount
        : null;

    return (
        <SettingsPage
            title={department.name}
            isBeta
            breadcrumbs={[
                { title: 'Adoption', to: ADOPTION_PATH },
                ...ancestors.map((ancestor) => ({
                    title: ancestor.name,
                    to: getDepartmentPath(ancestor.departmentUuid),
                })),
            ]}
            actions={
                canManage ? (
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconPencil} />}
                        disabled={!summary.data}
                        onClick={() => setIsEditing(true)}
                    >
                        Edit department
                    </Button>
                ) : null
            }
        >
            <Stack gap="lg">
                {department.headcountBelowChildren && (
                    <Text fz="sm" c="yellow">
                        The headcount entered is below its sub-departments and
                        its own people, so that total counts instead
                    </Text>
                )}

                <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <StatTile
                        label="Coverage"
                        value={
                            department.hasHeadcount
                                ? formatShare(
                                      metrics.coveragePct,
                                      metrics.memberCount,
                                  )
                                : getMissingHeadcountWord(canManage)
                        }
                        detail={getCoverageCaption(
                            headcount,
                            metrics.memberCount,
                        )}
                    />
                    <StatTile
                        label="Active in 30 days"
                        value={formatShare(
                            metrics.activePct,
                            metrics.activeCount30d,
                        )}
                        detail={getActiveCaption(
                            headcount,
                            metrics.activeCount30d,
                            metrics.memberCount,
                        )}
                    />
                </SimpleGrid>

                <Stack gap="xs">
                    <Title order={5}>Weekly active people</Title>
                    {metrics.memberCount === 0 && (
                        <Text fz="xs" c="dimmed">
                            No comparison: nobody on Lightdash yet
                        </Text>
                    )}
                    <WeeklyActiveChart weeks={weeks} />
                </Stack>

                <Stack gap="xs">
                    <Title order={5}>Key content</Title>
                    <SimpleGrid cols={{ base: 1, md: 3 }}>
                        <TopContentList
                            title="Dashboards"
                            kind="dashboards"
                            noun={VIEWS}
                            items={topContent.dashboards}
                        />
                        <TopContentList
                            title="Explores"
                            kind="explores"
                            noun={QUERIES}
                            items={topContent.explores}
                        />
                        <TopContentList
                            title="AI agents"
                            kind="aiAgents"
                            noun={PROMPTS}
                            items={topContent.aiAgents}
                        />
                    </SimpleGrid>
                </Stack>

                <OverlapsSection
                    overlaps={overlaps.data ?? null}
                    isError={overlaps.isError}
                    onRetry={() => void overlaps.refetch()}
                    selection={selection}
                    onSelect={selectOverlap}
                />

                {children.length > 0 && (
                    <Stack gap="xs">
                        <Title order={5}>Sub-departments</Title>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Department</Table.Th>
                                    <Table.Th>Coverage</Table.Th>
                                    <Table.Th>Active in 30 days</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {sortByCoverage(children).map((child) => (
                                    <Table.Tr key={child.departmentUuid}>
                                        <Table.Td>
                                            <Anchor
                                                component={Link}
                                                to={getDepartmentPath(
                                                    child.departmentUuid,
                                                )}
                                                fz="sm"
                                            >
                                                {child.name}
                                            </Anchor>
                                        </Table.Td>
                                        <Table.Td>
                                            {child.hasHeadcount ? (
                                                <Text fz="sm">
                                                    {formatShare(
                                                        child.metrics
                                                            .coveragePct,
                                                        child.metrics
                                                            .memberCount,
                                                    )}
                                                </Text>
                                            ) : (
                                                <Text fz="sm" c="dimmed">
                                                    {getMissingHeadcountWord(
                                                        canManage,
                                                    )}
                                                </Text>
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            <Text fz="sm">
                                                {formatShare(
                                                    child.metrics.activePct,
                                                    child.metrics
                                                        .activeCount30d,
                                                )}
                                            </Text>
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Stack>
                )}

                <Stack gap="xs">
                    <Title order={5}>People</Title>
                    {selection === null ? (
                        <DepartmentMembersTable members={members} />
                    ) : (
                        // A new overlap starts its list afresh, on its first page
                        <OverlapPeople
                            key={getOverlapSelectionKey(selection)}
                            label={getOverlapSelectionLabel(selection)}
                            people={
                                overlapPeople.data
                                    ? (overlapPeople.data.members ?? [])
                                    : null
                            }
                            isError={overlapPeople.isError}
                            onRetry={() => void overlapPeople.refetch()}
                            onClear={() => selectOverlap(null)}
                        />
                    )}
                </Stack>
            </Stack>

            {canManage && (
                <DepartmentDrawer
                    opened={isEditing}
                    onClose={() => setIsEditing(false)}
                    department={department}
                    departments={summary.data?.departments ?? []}
                    members={members}
                    onDeleteStart={() => setIsDeleting(true)}
                    onDeleteEnd={(succeeded) => {
                        if (succeeded) void navigate(ADOPTION_PATH);
                        else setIsDeleting(false);
                    }}
                />
            )}
        </SettingsPage>
    );
};

export default AdoptionDepartment;
