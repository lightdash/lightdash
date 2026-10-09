import {
    getAncestorUuids,
    getParentMap,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Text,
    Tooltip,
    type TextProps,
} from '@mantine/core';
import { useElementSize } from '@mantine/hooks';
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronRight,
    IconPencil,
} from '@tabler/icons-react';
import {
    useCallback,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type FC,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../components/common/ContentTable';
import MantineIcon from '../../../../components/common/MantineIcon';
import { withSelectedDepartment } from '../utils/adoptionNav';
import {
    buildDepartmentRows,
    formatOwners,
    formatRoleSplit,
    formatShare,
    getMissingHeadcountWord,
    type DepartmentRow,
} from '../utils/departmentRows';
import { formatCount, formatQuantity, SUB_DEPARTMENTS } from '../utils/format';
import { ActivitySparkline } from './ActivitySparkline';
import styles from './DepartmentsTable.module.css';

const INDENT_PX = 24;
const EXPANDER_WIDTH = 22;
const EXPLANATION_MAX_WIDTH = 280;
// Narrower tables leave out the role split, which the map's Role colouring also counts
const ROLE_SPLIT_MIN_TABLE_WIDTH = 1300;
// Hover, keyboard focus and touch, as the headcount note used to be visible text
const TOOLTIP_EVENTS = { hover: true, focus: true, touch: true };
const BELOW_CHILDREN_WARNING =
    'The headcount entered is below its sub-departments and its own people, so that total counts instead';

// Every cell keeps to one line: text that does not fit ends in an ellipsis and shows in full on hover
const CellText: FC<
    Pick<TextProps, 'fz' | 'c' | 'className'> & { children: string }
> = ({ children, fz = 'sm', c, className }) => (
    <Text
        fz={fz}
        c={c}
        truncate="end"
        title={children}
        miw={0}
        className={className}
    >
        {children}
    </Text>
);

// A value with an explanation in its tooltip, marked by a dotted underline; the tooltip repeats the value in case the column cuts it short
const ExplainedValue: FC<{ value: string; explanation: string }> = ({
    value,
    explanation,
}) => (
    <Tooltip
        label={
            <>
                {value}
                <br />
                {explanation}
            </>
        }
        multiline
        maw={EXPLANATION_MAX_WIDTH}
        events={TOOLTIP_EVENTS}
    >
        <Text
            fz="sm"
            truncate="end"
            miw={0}
            tabIndex={0}
            className={styles.explained}
        >
            {value}
        </Text>
    </Tooltip>
);

type Props = {
    departments: DepartmentWithMetrics[];
    canManage: boolean;
    // The department selected on the page; the table marks its row, or its nearest ancestor's below the levels shown
    selectedUuid: string | null;
    onEdit: (department: DepartmentWithMetrics) => void;
};

export const DepartmentsTable: FC<Props> = ({
    departments,
    canManage,
    selectedUuid,
    onEdit,
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    // A department selected from elsewhere opens the rows above it, so its own row shows
    const [openedFor, setOpenedFor] = useState<string | null>(null);
    if (selectedUuid !== openedFor) {
        setOpenedFor(selectedUuid);
        const ancestors =
            selectedUuid === null
                ? []
                : getAncestorUuids(selectedUuid, getParentMap(departments));
        if (ancestors.some((uuid) => !expanded.has(uuid))) {
            setExpanded(new Set([...expanded, ...ancestors]));
        }
    }
    const rows = useMemo(
        () => buildDepartmentRows(departments, expanded),
        [departments, expanded],
    );
    const markedUuid = useMemo(() => {
        if (selectedUuid === null) return null;
        const shown = new Set(rows.map((row) => row.department.departmentUuid));
        return (
            [
                selectedUuid,
                ...getAncestorUuids(selectedUuid, getParentMap(departments)),
            ].find((uuid) => shown.has(uuid)) ?? null
        );
    }, [selectedUuid, rows, departments]);
    // A name selects its department, keeping the rest of the page's link
    const [searchParams] = useSearchParams();
    const linkTo = useCallback(
        (departmentUuid: string) =>
            `?${withSelectedDepartment(searchParams, departmentUuid).toString()}`,
        [searchParams],
    );
    const { ref, width } = useElementSize();
    const showRoleSplit = width >= ROLE_SPLIT_MIN_TABLE_WIDTH;
    const toggle = useCallback((departmentUuid: string) => {
        setExpanded((previous) => {
            const next = new Set(previous);
            if (next.has(departmentUuid)) next.delete(departmentUuid);
            else next.add(departmentUuid);
            return next;
        });
    }, []);

    // Without the role split the widths fit a 1,100 px table, so names and numbers show whole
    const columns = useMemo<ContentTableColumnDef<DepartmentRow>[]>(() => {
        const dataColumns: ContentTableColumnDef<DepartmentRow>[] = [
            {
                id: 'name',
                header: 'Department',
                size: 252,
                Cell: ({ row }) => {
                    const {
                        department,
                        depth,
                        canExpand,
                        isExpanded,
                        childCount,
                    } = row.original;
                    const action = `${isExpanded ? 'Collapse' : 'Expand'} ${department.name}`;
                    return (
                        <Group gap="xs" wrap="nowrap" pl={depth * INDENT_PX}>
                            {canExpand ? (
                                <Tooltip label={action}>
                                    <ActionIcon
                                        size="sm"
                                        aria-label={action}
                                        aria-expanded={isExpanded}
                                        onClick={() =>
                                            toggle(department.departmentUuid)
                                        }
                                    >
                                        <MantineIcon
                                            icon={
                                                isExpanded
                                                    ? IconChevronDown
                                                    : IconChevronRight
                                            }
                                        />
                                    </ActionIcon>
                                </Tooltip>
                            ) : (
                                <Box
                                    w={EXPANDER_WIDTH}
                                    className={styles.fixed}
                                />
                            )}
                            <Anchor
                                component={Link}
                                to={linkTo(department.departmentUuid)}
                                fz="sm"
                                fw={depth === 0 ? 600 : 400}
                                truncate="end"
                                title={department.name}
                                miw={0}
                            >
                                {department.name}
                            </Anchor>
                            {!canExpand && childCount > 0 && (
                                <CellText
                                    fz="xs"
                                    c="dimmed"
                                    className={styles.yields}
                                >
                                    {formatQuantity(
                                        childCount,
                                        SUB_DEPARTMENTS,
                                    )}
                                </CellText>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'headcount',
                header: 'Headcount',
                size: 96,
                Cell: ({ row }) => {
                    const { department } = row.original;
                    if (!department.hasHeadcount) {
                        return canManage ? (
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                aria-label={`Add headcount for ${department.name}`}
                                onClick={() => onEdit(department)}
                            >
                                Add
                            </Button>
                        ) : (
                            <Text fz="sm" c="dimmed">
                                –
                            </Text>
                        );
                    }
                    const headcount = formatCount(
                        department.effectiveHeadcount,
                    );
                    return (
                        <Group gap="xs" wrap="nowrap">
                            {department.headcountNote === null ? (
                                <Text fz="sm">{headcount}</Text>
                            ) : (
                                <ExplainedValue
                                    value={headcount}
                                    explanation={department.headcountNote}
                                />
                            )}
                            {department.headcountBelowChildren && (
                                <Tooltip
                                    label={BELOW_CHILDREN_WARNING}
                                    events={TOOLTIP_EVENTS}
                                >
                                    <Box
                                        component="span"
                                        role="img"
                                        tabIndex={0}
                                        aria-label={BELOW_CHILDREN_WARNING}
                                    >
                                        <MantineIcon
                                            icon={IconAlertTriangle}
                                            color="yellow"
                                        />
                                    </Box>
                                </Tooltip>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'coverage',
                header: 'Coverage',
                size: 144,
                Cell: ({ row }) => {
                    const { department } = row.original;
                    if (department.hasHeadcount) {
                        return (
                            <CellText>
                                {formatShare(
                                    department.metrics.coveragePct,
                                    department.metrics.memberCount,
                                )}
                            </CellText>
                        );
                    }
                    // Editors have "Add" in the Headcount column already, so the cell stays empty for them
                    return canManage ? null : (
                        <CellText c="dimmed">
                            {getMissingHeadcountWord(false)}
                        </CellText>
                    );
                },
            },
            {
                id: 'active',
                header: 'Active 30d',
                size: 120,
                Cell: ({ row }) => (
                    <CellText>
                        {formatShare(
                            row.original.department.metrics.activePct,
                            row.original.department.metrics.activeCount30d,
                        )}
                    </CellText>
                ),
            },
            {
                id: 'roles',
                header: 'Roles',
                size: 100,
                Cell: ({ row }) => (
                    <CellText fz="xs" c="dimmed">
                        {formatRoleSplit(
                            row.original.department.metrics.roleSplit,
                        )}
                    </CellText>
                ),
            },
            {
                id: 'trend',
                header: '12 weeks',
                size: 130,
                Cell: ({ row }) => (
                    <ActivitySparkline
                        points={row.original.department.metrics.weeklyActive}
                    />
                ),
            },
            {
                id: 'owner',
                header: 'Owner',
                size: 130,
                Cell: ({ row }) => {
                    const { owners } = row.original.department;
                    if (owners.length === 0) {
                        return <CellText>{formatOwners(owners)}</CellText>;
                    }
                    const [first, ...others] = owners;
                    // Only the name gives way, so the count of other owners stays in sight
                    return (
                        <Group
                            gap={4}
                            wrap="nowrap"
                            title={owners.map((owner) => owner.name).join(', ')}
                        >
                            <Text fz="sm" truncate="end" miw={0}>
                                {first.name}
                            </Text>
                            {others.length > 0 && (
                                <Text fz="sm" flex="none">
                                    {`+${formatCount(others.length)}`}
                                </Text>
                            )}
                        </Group>
                    );
                },
            },
        ];
        // No empty column for people who cannot edit
        return canManage
            ? [
                  ...dataColumns,
                  {
                      id: 'edit',
                      header: '',
                      size: 48,
                      Cell: ({ row }) => {
                          const label = `Edit ${row.original.department.name}`;
                          return (
                              <Tooltip label={label}>
                                  <ActionIcon
                                      aria-label={label}
                                      onClick={() =>
                                          onEdit(row.original.department)
                                      }
                                  >
                                      <MantineIcon icon={IconPencil} />
                                  </ActionIcon>
                              </Tooltip>
                          );
                      },
                  },
              ]
            : dataColumns;
    }, [canManage, onEdit, toggle, linkTo]);

    // In a strip over the selected department the table scrolls within the strip's height, under its header
    const containerRef = useRef<HTMLDivElement | null>(null);
    const table = useContentTable<DepartmentRow>({
        columns,
        data: rows,
        enableColumnResizing: false,
        enablePagination: false,
        enableSorting: false,
        enableTopToolbar: false,
        enableBottomToolbar: false,
        getRowId: (row) => row.department.departmentUuid,
        mantineTableProps: { highlightOnHover: true },
        mantineTableContainerProps: {
            ref: containerRef,
            className: styles.container,
        },
        mantineTableBodyRowProps: ({ row }) =>
            row.original.department.departmentUuid === markedUuid
                ? {
                      'data-selected': true,
                      'aria-current': 'true',
                      className: styles.markedRow,
                  }
                : {},
        state: { columnVisibility: { roles: showRoleSplit } },
    });

    // The marked row is brought into the middle of what the strip shows below the table's header
    useLayoutEffect(() => {
        const container = containerRef.current;
        const row = container?.querySelector('tr[data-selected]');
        if (!container || !row) return;
        const box = container.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        const header =
            container.querySelector('thead')?.getBoundingClientRect().height ??
            0;
        container.scrollTop +=
            rowBox.top -
            box.top -
            header -
            (box.height - header - rowBox.height) / 2;
    }, [markedUuid]);

    return (
        <Box ref={ref}>
            <ContentTable table={table} />
        </Box>
    );
};
