import { type OrganizationAdoptionSummary } from '@lightdash/common';
import { Box, Paper, Stack, Text, VisuallyHidden } from '@mantine/core';
import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useState,
    type FC,
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
    // The department selected on the page, which the map opens as a strip above it; null for the whole organization
    selectedUuid: string | null;
    onSelect: (departmentUuid: string | null) => void;
    colourBy: ColourBy;
    onColourByChange: (colourBy: ColourBy) => void;
    // The person picked on the map, whose row the selected department's people show
    selectedUserUuid: string | null;
    onPersonClick: (userUuid: string) => void;
    // Label widths; measured with the page's own font unless one is supplied
    measureText?: TextMeasurer;
};

export const AdoptionMap: FC<Props> = ({
    summary,
    canManage,
    selectedUuid,
    onSelect,
    colourBy,
    onColourByChange,
    selectedUserUuid,
    onPersonClick,
    measureText,
}) => {
    const { departments } = summary;
    // A selected department is shown below the map, which becomes a strip with no panel beside it
    const isStrip = selectedUuid !== null;
    const [highlightedUuid, setHighlightedUuid] = useState<string | null>(null);
    const { ref, width, height, isMeasured } = useContainerSize(
        FALLBACK_SIZE,
        isStrip ? 'strip' : 'full',
    );

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
    // A department deleted while selected, or one not in the organization, falls back to the whole organization
    const focus =
        selectedUuid === null ? null : (byUuid.get(selectedUuid) ?? null);
    const focusedUuid = focus?.departmentUuid ?? null;
    const focusName = focus?.name ?? null;
    const visibleDepartments = useMemo(
        () => getVisibleDepartments(departments, focusedUuid),
        [departments, focusedUuid],
    );

    const describe = useCallback(
        (circles: PackedCircle[]) => describeCircles(circles, byUuid),
        [byUuid],
    );
    // Nothing is laid out until the drawing's box is measured for how the map is shown, so the strip coming or going
    // draws the map once, at its own size
    const circles = useMemo(
        () =>
            isMeasured
                ? layoutMap({
                      input: buildPackInput(departments, focusedUuid),
                      area: { width, height },
                      focusName,
                  })
                : [],
        [isMeasured, departments, focusedUuid, focusName, width, height],
    );
    const info = useMemo(() => describe(circles), [describe, circles]);
    // The legend under the map, its description and the panel beside it, or the selected department's bar, count
    // the same people from the same numbers
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
    const loadPeople = isMeasured && showDots && shouldLoadPeople(peopleInView);
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

    // The page moves focus to the department selected, and back to the view when it is deselected
    const focusOn = useCallback(
        (departmentUuid: string | null) => {
            onSelect(departmentUuid);
            setHighlightedUuid(null);
        },
        [onSelect],
    );

    const departmentCircles = circles.filter(
        (circle) => circle.kind === 'department',
    );
    const ringKeys = getRingKeys(circles);
    const namedPeople = listPeople ? getPeopleInView(dots) : [];

    return (
        <Stack gap="md" className={styles.root}>
            <AdoptionViewHeader
                label="Position on the map"
                isOrganization={!isStrip}
                colourBy={colourBy}
                onColourByChange={onColourByChange}
            />

            <Box className={styles.body} data-strip={isStrip || undefined}>
                <Paper className={styles.frame}>
                    <Box ref={ref} className={styles.canvas}>
                        {!isMeasured ? null : circles.length === 0 ? (
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
                                onPersonClick={onPersonClick}
                            />
                        )}
                    </Box>
                    {/* The drawing is one image to assistive tech, so its controls are real buttons here */}
                    <VisuallyHidden component="div">
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
                                                onPersonClick(member.userUuid)
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
                {!isStrip && (
                    <MapInspector
                        breakdown={breakdown}
                        rows={rows}
                        canManage={canManage}
                        keySwatch={DotSwatch}
                        onDepartmentClick={focusOn}
                    />
                )}
            </Box>
        </Stack>
    );
};
