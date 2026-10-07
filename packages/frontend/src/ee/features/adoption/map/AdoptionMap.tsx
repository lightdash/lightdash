import {
    type DepartmentWithMetrics,
    type OrganizationAdoptionSummary,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Breadcrumbs,
    Group,
    Paper,
    SegmentedControl,
    Stack,
    Text,
    VisuallyHidden,
} from '@mantine/core';
import { useCallback, useMemo, useState, type FC } from 'react';
import { useDepartmentDetail } from '../../../hooks/useOrgDepartments';
import styles from './AdoptionMap.module.css';
import { DepartmentMap } from './DepartmentMap';
import {
    buildPackInput,
    countPeople,
    layoutPack,
    MAP_SIZE,
    shouldRenderDots,
    SVG_DOT_LIMIT,
    type ColourBy,
} from './geometry';
import { MapCardGrid } from './MapCardGrid';
import { computeMapCards } from './mapCards';
import { MapInspector } from './MapInspector';
import { getPackSize, positionCircles } from './mapLayout';
import { MapLegend } from './MapLegend';
import { COLOUR_BY_LABELS, COLOUR_BY_OPTIONS, isColourBy } from './mapStyles';
import {
    buildDots,
    buildMapAriaLabel,
    countDotKinds,
    describeCircles,
    getFocusTrail,
    getViewTotals,
    getVisibleDepartments,
    groupMembersByDepartment,
    nameLoneBucket,
    shouldShowNames,
} from './mapView';
import { useContainerSize } from './useContainerSize';

const ROOT_NAME = 'All departments';
// Used only where the container cannot be measured
const FALLBACK_SIZE = { width: MAP_SIZE, height: 560 };

type Props = {
    summary: OrganizationAdoptionSummary;
    canManage: boolean;
    onEdit: (department: DepartmentWithMetrics) => void;
};

export const AdoptionMap: FC<Props> = ({ summary, canManage, onEdit }) => {
    const { departments } = summary;
    const [focusUuid, setFocusUuid] = useState<string | null>(null);
    const [selectedUserUuid, setSelectedUserUuid] = useState<string | null>(
        null,
    );
    const [highlightedUuid, setHighlightedUuid] = useState<string | null>(null);
    const [colourBy, setColourBy] = useState<ColourBy>('active');
    const { ref, width, height } = useContainerSize(FALLBACK_SIZE);
    // One clock per visit, so a dot never changes kind between renders
    const now = useMemo(() => new Date(), []);

    const byUuid = useMemo(
        () => new Map(departments.map((d) => [d.departmentUuid, d])),
        [departments],
    );
    // A department deleted while focused falls back to the whole organization
    const focus = focusUuid === null ? null : (byUuid.get(focusUuid) ?? null);
    const focusedUuid = focus?.departmentUuid ?? null;
    const visibleDepartments = useMemo(
        () => getVisibleDepartments(departments, focusedUuid),
        [departments, focusedUuid],
    );
    const trail = useMemo(
        () => getFocusTrail(departments, focusedUuid),
        [departments, focusedUuid],
    );

    const circles = useMemo(() => {
        const size = getPackSize(width, height);
        return nameLoneBucket(
            positionCircles(
                layoutPack(buildPackInput(departments, focusedUuid), size),
                width,
                height,
                size,
            ),
            focus?.name ?? null,
        );
    }, [departments, focusedUuid, focus?.name, width, height]);
    const info = useMemo(
        () => describeCircles(circles, byUuid),
        [circles, byUuid],
    );
    const totals = useMemo(() => getViewTotals(circles), [circles]);
    const peopleInView = countPeople(circles);
    const showDots = shouldRenderDots(peopleInView);

    // Names, roles and last activity for the people inside the focused department
    const detail = useDepartmentDetail(focusedUuid ?? undefined);
    const loadedMembers =
        showDots &&
        focusedUuid !== null &&
        detail.data?.department.departmentUuid === focusedUuid
            ? detail.data.members
            : null;
    const membersByDepartment = useMemo(
        () =>
            loadedMembers === null
                ? null
                : groupMembersByDepartment(loadedMembers),
        [loadedMembers],
    );
    const showNames = shouldShowNames(peopleInView, loadedMembers !== null);
    const selectedMember =
        loadedMembers?.find((m) => m.userUuid === selectedUserUuid) ?? null;

    const dots = useMemo(
        () =>
            showDots
                ? circles.flatMap((circle) =>
                      buildDots(circle, colourBy, membersByDepartment, now),
                  )
                : [],
        [showDots, circles, colourBy, membersByDepartment, now],
    );
    const legendCounts = useMemo(
        () => countDotKinds(circles, colourBy, membersByDepartment, now),
        [circles, colourBy, membersByDepartment, now],
    );
    // Only the departments at this level compete: a parent would always beat its own children
    const cards = useMemo(
        () =>
            computeMapCards(
                visibleDepartments.length > 0 || focus === null
                    ? visibleDepartments
                    : [focus],
                summary.attention,
            ),
        [visibleDepartments, focus, summary.attention],
    );

    const focusOn = useCallback((departmentUuid: string | null) => {
        setFocusUuid(departmentUuid);
        setSelectedUserUuid(null);
        setHighlightedUuid(null);
    }, []);

    const departmentCircles = circles.filter(
        (circle) => circle.kind === 'department',
    );
    const namedDots = showNames ? dots.filter((dot) => dot.member) : [];

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center" gap="sm">
                <Breadcrumbs aria-label="Position on the map">
                    {focus === null ? (
                        <Text fz="sm" fw={600} aria-current="location">
                            {ROOT_NAME}
                        </Text>
                    ) : (
                        <Anchor
                            component="button"
                            type="button"
                            fz="sm"
                            c="dimmed"
                            onClick={() => focusOn(null)}
                        >
                            {ROOT_NAME}
                        </Anchor>
                    )}
                    {trail.map((department) =>
                        department.departmentUuid === focusedUuid ? (
                            <Text
                                key={department.departmentUuid}
                                fz="sm"
                                fw={600}
                                aria-current="location"
                            >
                                {department.name}
                            </Text>
                        ) : (
                            <Anchor
                                key={department.departmentUuid}
                                component="button"
                                type="button"
                                fz="sm"
                                c="dimmed"
                                onClick={() =>
                                    focusOn(department.departmentUuid)
                                }
                            >
                                {department.name}
                            </Anchor>
                        ),
                    )}
                </Breadcrumbs>
                <Group gap="xs" wrap="nowrap">
                    <Text fz="xs" c="dimmed" id="adoption-map-colour-by">
                        Colour by
                    </Text>
                    <SegmentedControl
                        size="xs"
                        aria-labelledby="adoption-map-colour-by"
                        value={colourBy}
                        onChange={(value) => {
                            if (isColourBy(value)) setColourBy(value);
                        }}
                        data={COLOUR_BY_OPTIONS.map((value) => ({
                            value,
                            label: COLOUR_BY_LABELS[value],
                        }))}
                    />
                </Group>
            </Group>

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
                                showNames={showNames}
                                ariaLabel={buildMapAriaLabel({
                                    scopeName: focus?.name ?? null,
                                    departmentCount: visibleDepartments.length,
                                    totals,
                                    areDotsHidden: !showDots,
                                })}
                                layoutKey={focusedUuid ?? 'root'}
                                highlightedUuid={highlightedUuid}
                                selectedUserUuid={selectedUserUuid}
                                onDepartmentClick={focusOn}
                                onPersonClick={setSelectedUserUuid}
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
                        {namedDots.length > 0 && (
                            <ul aria-label="People on the map">
                                {namedDots.map(({ key, member }) =>
                                    member === null ? null : (
                                        <li key={key}>
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
                                    ),
                                )}
                            </ul>
                        )}
                    </VisuallyHidden>
                    <MapLegend
                        colourBy={colourBy}
                        counts={legendCounts}
                        hasEmptyDepartment={departmentCircles.some(
                            (circle) => !circle.hasMembers,
                        )}
                        hasDepartmentWithoutHeadcount={departmentCircles.some(
                            (circle) =>
                                circle.hasMembers && !circle.hasHeadcount,
                        )}
                        hasEnlargedCircle={circles.some(
                            (circle) => !circle.isAreaHonest,
                        )}
                        areDotsHidden={!showDots}
                        dotLimit={SVG_DOT_LIMIT}
                    />
                </Paper>
                <MapInspector
                    department={focus}
                    subDepartments={visibleDepartments}
                    totals={totals}
                    member={selectedMember}
                    canManage={canManage}
                    onDepartmentClick={focusOn}
                    onClearMember={() => setSelectedUserUuid(null)}
                    onEdit={onEdit}
                />
            </Box>

            <MapCardGrid cards={cards} onDepartmentClick={focusOn} />
        </Stack>
    );
};
