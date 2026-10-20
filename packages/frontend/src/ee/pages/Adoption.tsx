import { subject } from '@casl/ability';
import { type DepartmentWithMetrics } from '@lightdash/common';
import { Button, Group, SegmentedControl, Stack } from '@mantine/core';
import { IconAlertCircle, IconPlus, IconUsers } from '@tabler/icons-react';
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import EmptyStateLoader from '../../components/common/EmptyStateLoader';
import MantineIcon from '../../components/common/MantineIcon';
import { SettingsPage } from '../../components/common/Settings/SettingsPage';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import useApp from '../../providers/App/useApp';
import useTracking from '../../providers/Tracking/useTracking';
import { EventName } from '../../types/Events';
import { AdoptionEmptyState } from '../features/adoption/components/AdoptionEmptyState';
import { AttentionStrip } from '../features/adoption/components/AttentionStrip';
import { DepartmentDrawer } from '../features/adoption/components/DepartmentDrawer';
import { DepartmentsTable } from '../features/adoption/components/DepartmentsTable';
import { MembershipModal } from '../features/adoption/components/MembershipModal';
import { SelectedDepartment } from '../features/adoption/components/SelectedDepartment';
import { ViewStrip } from '../features/adoption/components/ViewStrip';
import { AdoptionMap } from '../features/adoption/map/AdoptionMap';
import { type ColourBy } from '../features/adoption/map/geometry';
import { DotSwatch } from '../features/adoption/map/MapLegend';
import {
    ADOPTION_VIEW_LABELS,
    ADOPTION_VIEWS,
    getDepartmentPath,
    getSelectedDepartment,
    parseAdoptionView,
    VIEW_PARAM,
    withSelectedDepartment,
    type AdoptionView,
} from '../features/adoption/utils/adoptionNav';
import { type MembershipTab } from '../features/adoption/utils/attention';
import { type PersonHighlight } from '../features/adoption/utils/departmentDetail';
import {
    getViewStorageKey,
    readStoredView,
    resolveAdoptionView,
    writeStoredView,
} from '../features/adoption/utils/viewPreference';
import {
    WaffleSwatch,
    WaffleView,
} from '../features/adoption/waffle/WaffleView';
import {
    useDepartmentDetail,
    useOrgAdoptionSummary,
} from '../hooks/useOrgDepartments';

type DrawerState =
    | { opened: false }
    | { opened: true; departmentUuid: string | null };

// Escape in a field keeps its own meaning there
const isInField = (target: EventTarget): boolean =>
    target instanceof HTMLElement &&
    (target.isContentEditable ||
        target.closest(
            'input:not([type="radio"]):not([type="checkbox"]), textarea, select',
        ) !== null);

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
    // Shared with the selected department below the view, so the drawer lists its people without loading everyone's
    const selectedDetail = useDepartmentDetail(selectedUuid ?? undefined);
    // A person picked on the map is shown in the selected department's people; another selection drops them
    const [personPick, setPersonPick] = useState<{
        departmentUuid: string | null;
        highlight: PersonHighlight | null;
    }>({ departmentUuid: selectedUuid, highlight: null });
    if (personPick.departmentUuid !== selectedUuid) {
        setPersonPick({ departmentUuid: selectedUuid, highlight: null });
    }
    const highlight =
        personPick.departmentUuid === selectedUuid
            ? personPick.highlight
            : null;
    // Picking the same person again is a new request, so their row comes back into view
    const pickPerson = useCallback(
        (userUuid: string) =>
            setPersonPick((previous) => ({
                departmentUuid: previous.departmentUuid,
                highlight: {
                    userUuid,
                    request: (previous.highlight?.request ?? 0) + 1,
                },
            })),
        [],
    );
    const [drawer, setDrawer] = useState<DrawerState>({ opened: false });
    // While a delete is in flight the department answers 404; what was shown stays until it is deselected
    const [isDeleting, setIsDeleting] = useState(false);
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
    // Each selection is a step in the browser's history, as opening a department page was. It names the view too, so
    // a link to it opens in the same view; deselecting keeps the view
    const select = useCallback(
        (departmentUuid: string | null) => {
            if (departmentUuid === selectedUuid) return;
            setSearchParams((previous) => {
                const next = withSelectedDepartment(previous, departmentUuid);
                if (departmentUuid !== null) next.set(VIEW_PARAM, view);
                return next;
            });
        },
        [selectedUuid, setSearchParams, view],
    );
    // A link that names a department but no view, such as the old route's or one followed from the list, gets the
    // view it opens in
    useEffect(() => {
        if (selectedUuid === null || searchParams.get(VIEW_PARAM) !== null) {
            return;
        }
        setSearchParams(
            (previous) => {
                const next = new URLSearchParams(previous);
                next.set(VIEW_PARAM, view);
                return next;
            },
            { replace: true },
        );
    }, [selectedUuid, searchParams, view, setSearchParams]);
    // One event for each department selected, where the department page's page view used to be sent
    const { track } = useTracking();
    const trackedSelectionRef = useRef<string | null>(null);
    useEffect(() => {
        if (selectedUuid === null) {
            trackedSelectionRef.current = null;
            return;
        }
        if (trackedSelectionRef.current === selectedUuid) return;
        trackedSelectionRef.current = selectedUuid;
        track({
            name: EventName.ADOPTION_DEPARTMENT_SELECTED,
            properties: { departmentUuid: selectedUuid, view },
        });
    }, [selectedUuid, view, track]);
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

    // Focus comes back to the view when the department is deselected, by the breadcrumb, Escape or the browser
    const viewRef = useRef<HTMLDivElement | null>(null);
    const previousSelectionRef = useRef(selectedUuid);
    useEffect(() => {
        if (previousSelectionRef.current !== null && selectedUuid === null) {
            viewRef.current?.focus();
        }
        previousSelectionRef.current = selectedUuid;
    }, [selectedUuid]);
    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        if (
            event.key !== 'Escape' ||
            selectedUuid === null ||
            event.defaultPrevented ||
            isInField(event.target)
        ) {
            return;
        }
        select(null);
    };

    const departments = summary.data?.departments ?? [];
    const unassignedCount = summary.data?.attention.unassignedCount ?? 0;
    const placePeople = () =>
        openPlacing(unassignedCount > 0 ? 'unassigned' : 'shared');
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
    const editingMembers =
        drawer.opened &&
        drawer.departmentUuid !== null &&
        drawer.departmentUuid === selectedUuid
            ? (selectedDetail.data?.members ?? null)
            : null;

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
                    {/* Always somewhere, so where shared people count can be changed once nobody needs placing; with a
                        department selected it is beside the department's name */}
                    {selectedUuid === null && (
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<MantineIcon icon={IconUsers} />}
                            onClick={placePeople}
                        >
                            Place people
                        </Button>
                    )}
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
                    <Stack gap="lg" onKeyDown={handleKeyDown}>
                        <ViewStrip
                            ref={viewRef}
                            label={ADOPTION_VIEW_LABELS[view]}
                            isStrip={selectedUuid !== null}
                        >
                            {view === 'map' && (
                                <AdoptionMap
                                    summary={summary.data}
                                    canManage={canManage}
                                    selectedUuid={selectedUuid}
                                    onSelect={select}
                                    colourBy={colourBy}
                                    onColourByChange={setColourBy}
                                    selectedUserUuid={
                                        highlight?.userUuid ?? null
                                    }
                                    onPersonClick={pickPerson}
                                />
                            )}
                            {view === 'list' && (
                                <DepartmentsTable
                                    departments={departments}
                                    canManage={canManage}
                                    selectedUuid={selectedUuid}
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
                                />
                            )}
                        </ViewStrip>
                        {selectedUuid !== null && (
                            // A department starts afresh each time it is selected
                            <SelectedDepartment
                                key={selectedUuid}
                                departmentUuid={selectedUuid}
                                organization={summary.data.organization}
                                colourBy={colourBy}
                                keySwatch={
                                    view === 'waffle' ? WaffleSwatch : DotSwatch
                                }
                                canManage={canManage}
                                isDeleting={isDeleting}
                                highlight={highlight}
                                onSelect={select}
                                onEdit={openEdit}
                                onPlacePeople={placePeople}
                            />
                        )}
                    </Stack>
                </Stack>
            )}
            {canManage && (
                <>
                    <DepartmentDrawer
                        opened={drawer.opened}
                        onClose={() => setDrawer({ opened: false })}
                        department={editing}
                        departments={departments}
                        members={editingMembers}
                        onDeleteStart={() => setIsDeleting(true)}
                        onDeleteEnd={(succeeded) => {
                            setIsDeleting(false);
                            // The department deleted was the one selected, so the organization shows again
                            if (
                                succeeded &&
                                drawer.opened &&
                                drawer.departmentUuid === selectedUuid
                            ) {
                                select(null);
                            }
                        }}
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

// The department page's old link, kept so that links already shared open the department on this page
export const AdoptionDepartmentRedirect: FC = () => {
    const { departmentUuid = '' } = useParams<{ departmentUuid: string }>();
    return <Navigate to={getDepartmentPath(departmentUuid)} replace />;
};

export default Adoption;
