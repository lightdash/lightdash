import { subject } from '@casl/ability';
import { type DepartmentWithMetrics } from '@lightdash/common';
import { Button, Group, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconAlertCircle, IconPlus } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import { useSearchParams } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../providers/App/useApp';
import { AdoptionEmptyState } from '../features/adoption/components/AdoptionEmptyState';
import { AttentionStrip } from '../features/adoption/components/AttentionStrip';
import { DepartmentDrawer } from '../features/adoption/components/DepartmentDrawer';
import { DepartmentsTable } from '../features/adoption/components/DepartmentsTable';
import { MembershipModal } from '../features/adoption/components/MembershipModal';
import { AdoptionMap } from '../features/adoption/map/AdoptionMap';
import {
    ADOPTION_VIEW_LABELS,
    ADOPTION_VIEWS,
    parseAdoptionView,
    type AdoptionView,
} from '../features/adoption/utils/adoptionNav';
import {
    formatCount,
    formatQuantity,
    PEOPLE,
} from '../features/adoption/utils/format';
import {
    getViewStorageKey,
    readStoredView,
    resolveAdoptionView,
    writeStoredView,
} from '../features/adoption/utils/viewPreference';
import { useOrgAdoptionSummary } from '../hooks/useOrgDepartments';

const VIEW_PARAM = 'view';

type DrawerState =
    | { opened: false }
    | { opened: true; departmentUuid: string | null };

const Adoption: FC = () => {
    const { user } = useApp();
    const canManage =
        user.data?.ability.can(
            'manage',
            subject('OrganizationAdoption', {
                organizationUuid: user.data.organizationUuid,
            }),
        ) ?? false;
    const summary = useOrgAdoptionSummary();
    const [searchParams, setSearchParams] = useSearchParams();
    // The link wins; without one the page opens on the view this person last chose
    const viewStorageKey = getViewStorageKey(user.data?.userUuid);
    const view = resolveAdoptionView(
        searchParams.get(VIEW_PARAM),
        readStoredView(viewStorageKey),
    );
    const [drawer, setDrawer] = useState<DrawerState>({ opened: false });
    const [isPlacingPeople, setIsPlacingPeople] = useState(false);

    const setView = (next: AdoptionView) => {
        writeStoredView(viewStorageKey, next);
        setSearchParams(
            (previous) => {
                const params = new URLSearchParams(previous);
                params.set(VIEW_PARAM, next);
                return params;
            },
            { replace: true },
        );
    };
    const openCreate = useCallback(
        () => setDrawer({ opened: true, departmentUuid: null }),
        [],
    );
    const openEdit = useCallback(
        (department: DepartmentWithMetrics) =>
            setDrawer({
                opened: true,
                departmentUuid: department.departmentUuid,
            }),
        [],
    );

    const departments = summary.data?.departments ?? [];
    // Read the edited department from fresh data so the drawer never shows stale values
    const found =
        drawer.opened && drawer.departmentUuid !== null
            ? (departments.find(
                  (d) => d.departmentUuid === drawer.departmentUuid,
              ) ?? null)
            : null;
    // A delete removes the department from fresh data before the drawer closes; keep showing it until then
    const lastFound = useRef<DepartmentWithMetrics | null>(null);
    useEffect(() => {
        lastFound.current = found ?? lastFound.current;
    }, [found]);
    const heldDepartment =
        drawer.opened &&
        drawer.departmentUuid !== null &&
        lastFound.current?.departmentUuid === drawer.departmentUuid
            ? lastFound.current
            : null;
    const editing = found ?? heldDepartment;

    const statusCode = summary.error?.error.statusCode;
    const isUnavailable = statusCode === 403 || statusCode === 404;

    const actions = (
        <Group gap="xs" wrap="nowrap">
            {ADOPTION_VIEWS.length > 1 && (
                <SegmentedControl
                    size="xs"
                    value={view}
                    onChange={(value) => setView(parseAdoptionView(value))}
                    data={ADOPTION_VIEWS.map((value) => ({
                        value,
                        label: ADOPTION_VIEW_LABELS[value],
                    }))}
                />
            )}
            {canManage && summary.data && departments.length > 0 && (
                <Button
                    size="xs"
                    leftSection={<MantineIcon icon={IconPlus} />}
                    onClick={openCreate}
                >
                    New department
                </Button>
            )}
        </Group>
    );

    return (
        <SettingsPage
            title="Adoption"
            isBeta
            description="See how each department is adopting Lightdash, including the ones that haven't started"
            actions={actions}
        >
            {summary.isInitialLoading && <EmptyStateLoader />}
            {summary.isError && (
                <SuboptimalState
                    icon={IconAlertCircle}
                    title={
                        isUnavailable
                            ? "Adoption isn't available for your organization"
                            : "Adoption by department isn't available"
                    }
                    description={
                        isUnavailable
                            ? 'Ask an admin if you think you should have access'
                            : summary.error.error.message
                    }
                />
            )}
            {summary.data && departments.length === 0 && (
                <AdoptionEmptyState
                    canManage={canManage}
                    onCreate={openCreate}
                />
            )}
            {summary.data && departments.length > 0 && (
                <Stack gap="md">
                    <Text fz="sm" c="dimmed">
                        {`${formatQuantity(summary.data.organization.memberCount, PEOPLE)} on Lightdash · ${formatCount(summary.data.organization.activeCount30d)} active in the last 30 days`}
                    </Text>
                    <AttentionStrip
                        conflictCount={summary.data.attention.conflictCount}
                        unassignedCount={summary.data.attention.unassignedCount}
                        canManage={canManage}
                        onReview={() => setIsPlacingPeople(true)}
                    />
                    {view === 'map' && (
                        <AdoptionMap
                            summary={summary.data}
                            canManage={canManage}
                            onEdit={openEdit}
                        />
                    )}
                    {view === 'list' && (
                        <DepartmentsTable
                            departments={departments}
                            canManage={canManage}
                            onEdit={openEdit}
                        />
                    )}
                </Stack>
            )}
            {canManage && (
                <>
                    <DepartmentDrawer
                        opened={drawer.opened}
                        onClose={() => setDrawer({ opened: false })}
                        department={editing}
                        departments={departments}
                        members={null}
                    />
                    <MembershipModal
                        opened={isPlacingPeople}
                        onClose={() => setIsPlacingPeople(false)}
                        departments={departments}
                    />
                </>
            )}
        </SettingsPage>
    );
};

export default Adoption;
