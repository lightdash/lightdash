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
} from '@mantine/core';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import mapStyles from '../map/AdoptionMap.module.css';
import { type ColourBy, type DotKind } from '../map/geometry';
import { MapInspector } from '../map/MapInspector';
import {
    COLOUR_BY_LABELS,
    COLOUR_BY_OPTIONS,
    DOT_LABELS,
    isColourBy,
    LEGEND_KINDS,
} from '../map/mapStyles';
import {
    getFocusTrail,
    getLegendCounts,
    getVisibleDepartments,
} from '../map/mapView';
import { useContainerSize } from '../map/useContainerSize';
import { formatCount } from '../utils/format';
import {
    getCoverageRows,
    getDepartmentBreakdown,
    getOrganizationBreakdown,
} from '../utils/peopleBreakdown';
import { getPartPeople, groupSquares } from './groupSquares';
import { layoutWaffle, SQUARE_LIMIT } from './layout';
import styles from './Waffle.module.css';
import { WaffleBlock } from './WaffleBlock';
import { buildWaffleBlocks } from './waffleBlocks';

const ROOT_NAME = 'All departments';
// Used only where the container cannot be measured
const FALLBACK_SIZE = { width: 720, height: 560 };

type Props = {
    summary: OrganizationAdoptionSummary;
    canManage: boolean;
    onEdit: (department: DepartmentWithMetrics) => void;
};

const WaffleLegend: FC<{
    colourBy: ColourBy;
    counts: Map<DotKind, number>;
    isOverLimit: boolean;
}> = ({ colourBy, counts, isOverLimit }) => (
    <Stack gap={6} className={mapStyles.footer}>
        <ul className={mapStyles.legend} aria-label="Legend">
            {LEGEND_KINDS[colourBy].map((kind) => (
                <li key={kind} className={mapStyles.legendItem}>
                    <Box
                        component="span"
                        className={`${styles.mark} ${styles.swatch}`}
                        data-kind={kind}
                        aria-hidden
                    />
                    <Text fz="xs">{DOT_LABELS[kind]}</Text>
                    <Text fz="xs" c="dimmed" className={mapStyles.count}>
                        {formatCount(counts.get(kind) ?? 0)}
                    </Text>
                </li>
            ))}
        </ul>
        <Text fz="xs" c="dimmed">
            Legend counts people placed in a department
        </Text>
        {isOverLimit && (
            <Text fz="xs" c="dimmed">
                {`Departments are drawn as bars above ${formatCount(SQUARE_LIMIT)} people`}
            </Text>
        )}
        <Text fz="xs" c="dimmed">
            Each square is a person. Select a department to see its numbers
        </Text>
    </Stack>
);

// Every top-level department as a block sized by headcount, its sub-departments stacked inside, and one square per
// person grouped by colour. Selecting a block shows its department in the panel, as selecting a circle on the map does
export const WaffleView: FC<Props> = ({ summary, canManage, onEdit }) => {
    const { departments } = summary;
    const [selectedUuid, setSelectedUuid] = useState<string | null>(null);
    const [colourBy, setColourBy] = useState<ColourBy>('active');
    const { ref, width, height } = useContainerSize(FALLBACK_SIZE);

    const byUuid = useMemo(
        () => new Map(departments.map((d) => [d.departmentUuid, d])),
        [departments],
    );
    // A department deleted while selected falls back to the whole organization
    const selected =
        selectedUuid === null ? null : (byUuid.get(selectedUuid) ?? null);
    const selectedDepartmentUuid = selected?.departmentUuid ?? null;
    const trail = useMemo(
        () => getFocusTrail(departments, selectedDepartmentUuid),
        [departments, selectedDepartmentUuid],
    );

    const blocks = useMemo(() => buildWaffleBlocks(departments), [departments]);
    const blocksById = useMemo(
        () => new Map(blocks.map((block) => [block.departmentUuid, block])),
        [blocks],
    );
    const layout = useMemo(
        () =>
            layoutWaffle({
                blocks: blocks.map((block) => ({
                    id: block.departmentUuid,
                    size: block.size,
                    parts: block.parts.map((part) => ({
                        id: part.id,
                        size: part.size,
                        hasName: part.name !== null,
                    })),
                })),
                width,
                height,
            }),
        [blocks, width, height],
    );
    const parts = useMemo(
        () => blocks.flatMap((block) => block.parts),
        [blocks],
    );
    // Made once for each set of counts, so a change of colouring only gives the same people new places
    const peopleByPart = useMemo(
        () =>
            new Map(
                layout.isOverLimit
                    ? []
                    : parts.map((part) => [
                          part.id,
                          getPartPeople(part.id, part.people.metrics),
                      ]),
            ),
        [parts, layout.isOverLimit],
    );
    const squaresByPart = useMemo(
        () =>
            new Map(
                parts.flatMap((part) => {
                    const people = peopleByPart.get(part.id);
                    return people === undefined
                        ? []
                        : [
                              [
                                  part.id,
                                  groupSquares(people, colourBy, part.size),
                              ],
                          ];
                }),
            ),
        [parts, peopleByPart, colourBy],
    );

    // The legend counts the people drawn, from the same numbers as the panel; the panel shows the selection
    const organizationBreakdown = useMemo(
        () => getOrganizationBreakdown(departments),
        [departments],
    );
    const legendCounts = useMemo(
        () => getLegendCounts(organizationBreakdown, parts, colourBy, null),
        [organizationBreakdown, parts, colourBy],
    );
    const breakdown = useMemo(
        () =>
            selected === null
                ? organizationBreakdown
                : getDepartmentBreakdown(selected),
        [selected, organizationBreakdown],
    );
    const rows = useMemo(
        () =>
            getCoverageRows(
                getVisibleDepartments(departments, selectedDepartmentUuid),
                departments,
            ),
        [departments, selectedDepartmentUuid],
    );

    const select = useCallback((departmentUuid: string | null) => {
        setSelectedUuid(departmentUuid);
    }, []);
    const clearMember = useCallback(() => {}, []);

    // A breadcrumb that becomes the current one is redrawn as text, so focus moves to the new current crumb
    const currentCrumbRef = useRef<HTMLParagraphElement | null>(null);
    const shouldFocusCrumbRef = useRef(false);
    const selectFromCrumb = (departmentUuid: string | null) => {
        shouldFocusCrumbRef.current = true;
        select(departmentUuid);
    };
    useEffect(() => {
        if (!shouldFocusCrumbRef.current) return;
        shouldFocusCrumbRef.current = false;
        currentCrumbRef.current?.focus();
    }, [selectedDepartmentUuid]);

    const topUuid = trail[0]?.departmentUuid ?? null;
    // Within the selected department's block, the block itself or the part holding the selection
    const markedInBlock =
        topUuid === null ? null : (trail[1]?.departmentUuid ?? topUuid);

    const crumb = (department: DepartmentWithMetrics | null) => {
        const name = department?.name ?? ROOT_NAME;
        const uuid = department?.departmentUuid ?? null;
        return uuid === selectedDepartmentUuid ? (
            <Text
                key={uuid ?? 'root'}
                ref={currentCrumbRef}
                className={mapStyles.crumb}
                tabIndex={-1}
                fz="sm"
                fw={600}
                aria-current="location"
            >
                {name}
            </Text>
        ) : (
            <Anchor
                key={uuid ?? 'root'}
                component="button"
                type="button"
                fz="sm"
                c="dimmed"
                onClick={() => selectFromCrumb(uuid)}
            >
                {name}
            </Anchor>
        );
    };

    return (
        <Stack gap="md">
            <Group justify="space-between" align="center" gap="sm">
                <Breadcrumbs aria-label="Selected department">
                    {[null, ...trail].map(crumb)}
                </Breadcrumbs>
                <Group gap="xs" wrap="nowrap">
                    <Text fz="xs" c="dimmed" id="adoption-waffle-colour-by">
                        Color by
                    </Text>
                    <SegmentedControl
                        size="xs"
                        aria-labelledby="adoption-waffle-colour-by"
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

            <Box className={mapStyles.body}>
                <Paper className={mapStyles.frame}>
                    <Box ref={ref} className={mapStyles.canvas}>
                        {layout.blocks.length === 0 ? (
                            <Box className={mapStyles.message}>
                                <Text fz="sm" c="dimmed">
                                    No people or headcount in this department
                                    yet
                                </Text>
                            </Box>
                        ) : (
                            <Box
                                className={styles.board}
                                role="group"
                                aria-label="Departments in the waffle"
                            >
                                {layout.blocks.map((blockLayout) => {
                                    const block = blocksById.get(
                                        blockLayout.id,
                                    );
                                    if (!block) return null;
                                    return (
                                        <WaffleBlock
                                            key={block.departmentUuid}
                                            block={block}
                                            layout={blockLayout}
                                            squaresByPart={squaresByPart}
                                            colourBy={colourBy}
                                            selectedUuid={
                                                block.departmentUuid === topUuid
                                                    ? selectedDepartmentUuid
                                                    : null
                                            }
                                            markedUuid={
                                                block.departmentUuid === topUuid
                                                    ? markedInBlock
                                                    : null
                                            }
                                            onSelect={select}
                                        />
                                    );
                                })}
                            </Box>
                        )}
                    </Box>
                    <WaffleLegend
                        colourBy={colourBy}
                        counts={legendCounts}
                        isOverLimit={layout.isOverLimit}
                    />
                </Paper>
                <MapInspector
                    department={selected}
                    parentName={trail[trail.length - 2]?.name ?? null}
                    breakdown={breakdown}
                    rows={rows}
                    member={null}
                    canManage={canManage}
                    onDepartmentClick={select}
                    onClearMember={clearMember}
                    onEdit={onEdit}
                />
            </Box>
        </Stack>
    );
};
