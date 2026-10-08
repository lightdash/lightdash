import { subject } from '@casl/ability';
import {
    Anchor,
    Badge,
    Button,
    Group,
    SimpleGrid,
    Stack,
    Table,
    Text,
    Title,
    Tooltip,
} from '@mantine/core';
import { IconAlertCircle, IconPencil } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { validate as isUuid } from 'uuid';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../providers/App/useApp';
import { DepartmentDrawer } from '../features/adoption/components/DepartmentDrawer';
import { DepartmentMembersTable } from '../features/adoption/components/DepartmentMembersTable';
import { StatTile } from '../features/adoption/components/StatTile';
import { TopContentList } from '../features/adoption/components/TopContentList';
import { WeeklyActiveChart } from '../features/adoption/components/WeeklyActiveChart';
import {
    ADOPTION_PATH,
    getDepartmentPath,
} from '../features/adoption/utils/adoptionNav';
import {
    countWithoutAccount,
    formatTargetProgress,
    getActiveCaption,
    getCoverageCaption,
} from '../features/adoption/utils/departmentDetail';
import {
    formatShare,
    sortByCoverage,
} from '../features/adoption/utils/departmentRows';
import {
    useDepartmentDetail,
    useOrgAdoptionSummary,
} from '../hooks/useOrgDepartments';

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
    // The drawer's parent picker needs every department
    const summary = useOrgAdoptionSummary(
        canManage && departmentUuid !== undefined,
    );
    const [isEditing, setIsEditing] = useState(false);
    // While a delete is in flight the refetch returns 404; keep the last page until we leave
    const [isDeleting, setIsDeleting] = useState(false);
    const navigate = useNavigate();

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
    const target = formatTargetProgress(detail.data.targetProgress);
    const withoutAccount = countWithoutAccount(
        department.effectiveHeadcount,
        metrics.memberCount,
    );

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
                <Group gap="lg">
                    <Group gap="xs">
                        <Text fz="sm" c="dimmed">
                            Owners
                        </Text>
                        {department.owners.length === 0 && (
                            <Text fz="sm">–</Text>
                        )}
                        {department.owners.map((owner) => (
                            <Badge key={`${owner.type}:${owner.uuid}`}>
                                {owner.name}
                            </Badge>
                        ))}
                    </Group>
                    <Group gap="xs">
                        <Text fz="sm" c="dimmed">
                            Headcount
                        </Text>
                        <Tooltip
                            label={department.headcountNote}
                            disabled={department.headcountNote === null}
                            multiline
                            maw={280}
                        >
                            <Text fz="sm">
                                {department.effectiveHeadcount ?? 'Not set'}
                            </Text>
                        </Tooltip>
                        {withoutAccount > 0 && (
                            <Text fz="sm" c="dimmed">
                                {`${withoutAccount} without an account`}
                            </Text>
                        )}
                        {department.headcountNote !== null && (
                            <Text fz="xs" c="dimmed">
                                {department.headcountNote}
                            </Text>
                        )}
                    </Group>
                    <Group gap="xs">
                        <Text fz="sm" c="dimmed">
                            Linked groups
                        </Text>
                        {department.linkedGroups.length === 0 && (
                            <Text fz="sm">–</Text>
                        )}
                        {department.linkedGroups.map((group) => (
                            <Badge key={group.groupUuid} variant="outline">
                                {group.name}
                            </Badge>
                        ))}
                    </Group>
                </Group>
                {department.headcountBelowChildren && (
                    <Text fz="sm" c="yellow">
                        Headcount is lower than the total of its sub-departments
                    </Text>
                )}

                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                    <StatTile
                        label="Coverage"
                        value={formatShare(
                            metrics.coveragePct,
                            metrics.memberCount,
                        )}
                        detail={getCoverageCaption(
                            department.effectiveHeadcount,
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
                            department.effectiveHeadcount,
                            metrics.activeCount30d,
                            metrics.memberCount,
                        )}
                    />
                    <StatTile
                        label="Target progress"
                        value={target.value}
                        detail={target.detail}
                    />
                </SimpleGrid>

                <Stack gap="xs">
                    <Title order={5}>Weekly active people</Title>
                    <WeeklyActiveChart points={detail.data.weeklyActive} />
                </Stack>

                <Stack gap="xs">
                    <Title order={5}>What this department uses</Title>
                    <SimpleGrid cols={{ base: 1, md: 3 }}>
                        <TopContentList
                            title="Dashboards"
                            unit="views"
                            items={topContent.dashboards}
                        />
                        <TopContentList
                            title="Explores"
                            unit="queries"
                            items={topContent.explores}
                        />
                        <TopContentList
                            title="AI agents"
                            unit="prompts"
                            items={topContent.aiAgents}
                        />
                    </SimpleGrid>
                </Stack>

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
                                            {formatShare(
                                                child.metrics.coveragePct,
                                                child.metrics.memberCount,
                                            )}
                                        </Table.Td>
                                        <Table.Td>
                                            {formatShare(
                                                child.metrics.activePct,
                                                child.metrics.activeCount30d,
                                            )}
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Stack>
                )}

                <Stack gap="xs">
                    <Title order={5}>People</Title>
                    <DepartmentMembersTable members={members} />
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
