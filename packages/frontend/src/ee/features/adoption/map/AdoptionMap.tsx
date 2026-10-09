import {
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import { Box, Paper, Stack, Text, VisuallyHidden } from '@mantine/core';
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type KeyboardEvent,
} from 'react';
import { useDepartmentDetail } from '../../../hooks/useOrgDepartments';
import {
    getCoverageRows,
    getDepartmentBreakdown,
    getOrganizationBreakdown,
    hasHeadcountInView,
} from '../utils/peopleBreakdown';
import styles from './AdoptionMap.module.css';
import { AdoptionViewHeader } from './AdoptionViewHeader';
import { DepartmentMap } from './DepartmentMap';
import {
    buildPackInput,
    countPeople,
    MAP_SIZE,
    shouldRenderDots,
    SVG_DOT_LIMIT,
    type ColourBy,
    type PackedCircle,
} from './geometry';
import { MapInspector } from './MapInspector';
import { estimateTextWidth, layoutMap, type TextMeasurer } from './mapLayout';
import { DotSwatch, MapLegend } from './MapLegend';
import {
    buildDots,
    buildMapAriaLabel,
    describeCircles,
    getFocusTrail,
    getLegendCounts,
    getPeopleInView,
    getRingKeys,
    getViewTotals,
    getVisibleDepartments,
    groupMembersByDepartment,
    shouldLoadPeople,
    shouldListPeople,
} from './mapView';
import { createTextMeasurer } from './textMeasure';
import { useContainerSize } from './useContainerSize';

// Used only where the container cannot be measured
const FALLBACK_SIZE = { width: MAP_SIZE, height: 560 };

type Props = {
    summary: OrganizationAdoptionSummary;
    canManage: boolean;
    onEdit: (department: DepartmentWithMetrics) => void;
    // Label widths; measured with the page's own font unless one is supplied
    measureText?: TextMeasurer;
};

export const AdoptionMap: FC<Props> = ({
    summary,
    canManage,
    onEdit,
    measureText,
}) => {
    const { departments } = summary;
    const [focusUuid, setFocusUuid] = useState<string | null>(null);
    const [selectedUserUuid, setSelectedUserUuid] = useState<string | null>(
        null,
    );
    const [highlightedUuid, setHighlightedUuid] = useState<string | null>(null);
    const [colourBy, setColourBy] = useState<ColourBy>('activity');
    const { ref, width, height } = useContainerSize(FALLBACK_SIZE);

    // Labels are measured in the font they are drawn in, again once web fonts have loaded
    const [font, setFont] = useState<{ family: string; epoch: number } | null>(
        null,
    );
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element || measureText) return undefined;
        let isCurrent = true;
        const family = getComputedStyle(element).fontFamily || 'sans-serif';
        setFont({ family, epoch: 0 });
        void document.fonts?.ready?.then(() => {
            if (isCurrent) setFont({ family, epoch: 1 });
        });
        return () => {
            isCurrent = false;
        };
    }, [ref, measureText]);
    const measure = useMemo<TextMeasurer>(() => {
        if (measureText) return measureText;
        return font === null
            ? estimateTextWidth
            : createTextMeasurer(font.family);
    }, [measureText, font]);

    const byUuid = useMemo(
        () => new Map(departments.map((d) => [d.departmentUuid, d])),
        [departments],
    );
    // A department deleted while focused falls back to the whole organization
    const focus = focusUuid === null ? null : (byUuid.get(focusUuid) ?? null);
    const focusedUuid = focus?.departmentUuid ?? null;
    const focusName = focus?.name ?? null;
    const visibleDepartments = useMemo(
        () => getVisibleDepartments(departments, focusedUuid),
        [departments, focusedUuid],
    );
    const trail = useMemo(
        () => getFocusTrail(departments, focusedUuid),
        [departments, focusedUuid],
    );

    const describe = useCallback(
        (circles: PackedCircle[]) => describeCircles(circles, byUuid),
        [byUuid],
    );
    const circles = useMemo(
        () =>
            layoutMap({
                input: buildPackInput(departments, focusedUuid),
                area: { width, height },
                focusName,
            }),
        [departments, focusedUuid, focusName, width, height],
    );
    const info = useMemo(() => describe(circles), [describe, circles]);
    // The panel, the legend under the map and the map's description count the same people from the same numbers
    const breakdown = useMemo(
        () =>
            focus === null
                ? getOrganizationBreakdown(summary, colourBy)
                : getDepartmentBreakdown(focus, colourBy),
        [focus, summary, colourBy],
    );
    const totals = useMemo(
        () =>
            getViewTotals(
                breakdown,
                focus === null
                    ? {
                          active: summary.placed.activeCount30d,
                          shared: summary.organization.sharedCount,
                      }
                    : {
                          active: focus.metrics.activeCount30d,
                          shared: focus.metrics.sharedCount,
                      },
            ),
        [breakdown, focus, summary],
    );
    const rows = useMemo(
        () => getCoverageRows(visibleDepartments, colourBy),
        [visibleDepartments, colourBy],
    );
    const peopleInView = countPeople(circles);
    const showDots = shouldRenderDots(peopleInView);

    // Names, roles and last activity for the people inside the focused department.
    // Not asked for when there are too many people in view to name them.
    const loadPeople = showDots && shouldLoadPeople(peopleInView);
    const detail = useDepartmentDetail(
        loadPeople ? (focusedUuid ?? undefined) : undefined,
    );
    const loadedMembers =
        loadPeople &&
        focusedUuid !== null &&
        detail.data?.department.departmentUuid === focusedUuid
            ? detail.data.members
            : null;
    const haveNamesFailed =
        loadPeople && focusedUuid !== null && detail.isError === true;
    const membersByDepartment = useMemo(
        () =>
            loadedMembers === null
                ? null
                : groupMembersByDepartment(loadedMembers),
        [loadedMembers],
    );
    const listPeople = shouldListPeople(peopleInView, loadedMembers !== null);
    const selectedMember =
        loadedMembers?.find((m) => m.userUuid === selectedUserUuid) ?? null;

    const dots = useMemo(
        () =>
            showDots
                ? circles.flatMap((circle) =>
                      buildDots(circle, colourBy, membersByDepartment),
                  )
                : [],
        [showDots, circles, colourBy, membersByDepartment],
    );
    const legendCounts = useMemo(() => getLegendCounts(breakdown), [breakdown]);

    // Whether the last thing the person did in the map was a key press or a pointer press
    const lastInputRef = useRef<'keyboard' | 'pointer'>('pointer');
    const shouldMoveFocusRef = useRef(false);
    const focusOn = useCallback((departmentUuid: string | null) => {
        shouldMoveFocusRef.current = lastInputRef.current === 'keyboard';
        setFocusUuid(departmentUuid);
        setSelectedUserUuid(null);
        setHighlightedUuid(null);
    }, []);

    // The control that was pressed is gone after a change of level, so keyboard focus moves to the
    // breadcrumb's current item. A pointer press leaves focus, and the page's scroll position, alone.
    const currentCrumbRef = useRef<HTMLParagraphElement | null>(null);
    const lastFocusedUuid = useRef(focusedUuid);
    useEffect(() => {
        if (lastFocusedUuid.current === focusedUuid) return;
        lastFocusedUuid.current = focusedUuid;
        if (!shouldMoveFocusRef.current) return;
        shouldMoveFocusRef.current = false;
        currentCrumbRef.current?.focus();
    }, [focusedUuid]);

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        lastInputRef.current = 'keyboard';
        if (event.key !== 'Escape' || focus === null) return;
        // Escape belongs to the map's own way-finding controls; elsewhere it keeps its usual meaning
        const isOnMapControl =
            event.target instanceof Element &&
            event.target.closest('[data-map-navigation]') !== null;
        if (event.defaultPrevented || !isOnMapControl) return;
        event.stopPropagation();
        // Up one level: the last ancestor in the trail, or the whole organization
        focusOn(trail[trail.length - 2]?.departmentUuid ?? null);
    };

    const departmentCircles = circles.filter(
        (circle) => circle.kind === 'department',
    );
    const ringKeys = getRingKeys(circles);
    const namedPeople = listPeople ? getPeopleInView(dots) : [];

    return (
        <Stack
            gap="md"
            className={styles.root}
            onKeyDown={handleKeyDown}
            onPointerDownCapture={() => {
                lastInputRef.current = 'pointer';
            }}
        >
            <AdoptionViewHeader
                label="Position on the map"
                trail={trail}
                currentUuid={focusedUuid}
                currentCrumbRef={currentCrumbRef}
                onCrumbClick={focusOn}
                colourBy={colourBy}
                onColourByChange={setColourBy}
            />

            <Box className={styles.body}>
                <Paper className={styles.frame}>
                    <Box ref={ref} className={styles.canvas}>
                        {circles.length === 0 ? (
                            <Box className={styles.message}>
                                <Text fz="sm" c="dimmed">
                                    No people or headcount in this department
                                    yet
                                </Text>
                            </Box>
                        ) : (
                            <DepartmentMap
                                width={width}
                                height={height}
                                circles={circles}
                                info={info}
                                dots={dots}
                                colourBy={colourBy}
                                ariaLabel={buildMapAriaLabel({
                                    scopeName: focusName,
                                    departmentCount: visibleDepartments.length,
                                    totals,
                                    areDotsHidden: !showDots,
                                    colourBy,
                                    breakdown,
                                    hasHeadcount: hasHeadcountInView(
                                        focus,
                                        visibleDepartments,
                                    ),
                                })}
                                measureText={measure}
                                layoutKey={focusedUuid ?? 'root'}
                                highlightedUuid={highlightedUuid}
                                selectedUserUuid={selectedUserUuid}
                                onDepartmentClick={focusOn}
                                onPersonClick={setSelectedUserUuid}
                            />
                        )}
                    </Box>
                    {/* The drawing is one image to assistive tech, so its controls are real buttons here */}
                    <VisuallyHidden component="div" data-map-navigation>
                        <ul aria-label="Departments on the map">
                            {departmentCircles.map((circle) => (
                                <li key={circle.id}>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            focusOn(circle.departmentUuid)
                                        }
                                        onFocus={() =>
                                            setHighlightedUuid(
                                                circle.departmentUuid,
                                            )
                                        }
                                        onBlur={() => setHighlightedUuid(null)}
                                    >
                                        {info.get(circle.id)?.description ??
                                            circle.name}
                                    </button>
                                </li>
                            ))}
                        </ul>
                        {namedPeople.length > 0 && (
                            <ul aria-label="People on the map">
                                {namedPeople.map((member) => (
                                    <li key={member.userUuid}>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setSelectedUserUuid(
                                                    member.userUuid,
                                                )
                                            }
                                        >
                                            {`${member.firstName} ${member.lastName}`.trim() ||
                                                member.email}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </VisuallyHidden>
                    <MapLegend
                        colourBy={colourBy}
                        counts={legendCounts}
                        hasSharedDots={dots.some((dot) => dot.isShared)}
                        isOrganizationView={focus === null}
                        hasEmptyDepartment={ringKeys.hasEmpty}
                        hasDepartmentWithoutHeadcount={ringKeys.hasNoHeadcount}
                        hasEnlargedCircle={circles.some(
                            (circle) => !circle.isAreaHonest,
                        )}
                        hasSubDepartments={circles.some(
                            (circle) => circle.depth > 1,
                        )}
                        areDotsHidden={!showDots}
                        haveNamesFailed={haveNamesFailed}
                        dotLimit={SVG_DOT_LIMIT}
                    />
                </Paper>
                <MapInspector
                    department={focus}
                    parentName={trail[trail.length - 2]?.name ?? null}
                    breakdown={breakdown}
                    colourBy={colourBy}
                    rows={rows}
                    member={selectedMember}
                    canManage={canManage}
                    keySwatch={DotSwatch}
                    onDepartmentClick={focusOn}
                    onClearMember={() => setSelectedUserUuid(null)}
                    onEdit={onEdit}
                />
            </Box>
        </Stack>
    );
};
