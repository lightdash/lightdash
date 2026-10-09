import { subject } from '@casl/ability';
import { type DepartmentWithMetrics } from '@lightdash/common';
import { Button, Group, SegmentedControl, Stack } from '@mantine/core';
import { IconAlertCircle, IconPlus, IconUsers } from '@tabler/icons-react';
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
import { type ColourBy } from '../features/adoption/map/geometry';
import {
    ADOPTION_VIEW_LABELS,
    ADOPTION_VIEWS,
    getSelectedDepartment,
    parseAdoptionView,
    VIEW_PARAM,
    withSelectedDepartment,
    type AdoptionView,
} from '../features/adoption/utils/adoptionNav';
import { type MembershipTab } from '../features/adoption/utils/attention';
import {
    getViewStorageKey,
    readStoredView,
    resolveAdoptionView,
    writeStoredView,
} from '../features/adoption/utils/viewPreference';
import { WaffleView } from '../features/adoption/waffle/WaffleView';
import { useOrgAdoptionSummary } from '../hooks/useOrgDepartments';

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
    // The link names the department selected, so a selection can be shared and survives a reload
    const selectedUuid = getSelectedDepartment(searchParams);
    // The views and the selected department colour people the same way
    const [colourBy, setColourBy] = useState<ColourBy>('activity');
    const [drawer, setDrawer] = useState<DrawerState>({ opened: false });
    const [isPlacingPeople, setIsPlacingPeople] = useState(false);
    // Kept apart from opened, so the dialog keeps its tab while it closes
    const [placingTab, setPlacingTab] = useState<MembershipTab>('unassigned');
    const openPlacing = (tab: MembershipTab) => {
        setPlacingTab(tab);
        setIsPlacingPeople(true);
    };

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
    // Each selection is a step in the browser's history, as opening a department page was
    const select = useCallback(
        (departmentUuid: string | null) => {
            if (departmentUuid === selectedUuid) return;
            setSearchParams((previous) =>
                withSelectedDepartment(previous, departmentUuid),
            );
        },
        [selectedUuid, setSearchParams],
    );
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
    const unassignedCount = summary.data?.attention.unassignedCount ?? 0;
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
                <>
                    {/* Always here, so where shared people count can be changed once nobody needs placing */}
                    <Button
                        size="xs"
                        variant="default"
                        leftSection={<MantineIcon icon={IconUsers} />}
                        onClick={() =>
                            openPlacing(
                                unassignedCount > 0 ? 'unassigned' : 'shared',
                            )
                        }
                    >
                        Place people
                    </Button>
                    <Button
                        size="xs"
                        leftSection={<MantineIcon icon={IconPlus} />}
                        onClick={openCreate}
                    >
                        New department
                    </Button>
                </>
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
                    <AttentionStrip
                        unassignedCount={summary.data.attention.unassignedCount}
                        sharedCount={summary.data.attention.sharedCount}
                        canManage={canManage}
                        onPlace={() => openPlacing('unassigned')}
                        onReviewShared={() => openPlacing('shared')}
                    />
                    {view === 'map' && (
                        <AdoptionMap
                            summary={summary.data}
                            canManage={canManage}
                            selectedUuid={selectedUuid}
                            onSelect={select}
                            colourBy={colourBy}
                            onColourByChange={setColourBy}
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
                    {view === 'waffle' && (
                        <WaffleView
                            summary={summary.data}
                            canManage={canManage}
                            selectedUuid={selectedUuid}
                            onSelect={select}
                            colourBy={colourBy}
                            onColourByChange={setColourBy}
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
                        tab={placingTab}
                        onTabChange={setPlacingTab}
                        onClose={() => setIsPlacingPeople(false)}
                        departments={departments}
                    />
                </>
            )}
        </SettingsPage>
    );
};

export default Adoption;
