import { type DepartmentWithMetrics } from '@lightdash/common';
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
import {
    IconAlertTriangle,
    IconChevronDown,
    IconChevronRight,
    IconPencil,
} from '@tabler/icons-react';
import { useCallback, useMemo, useState, type FC } from 'react';
import { Link } from 'react-router';
import {
    ContentTable,
    useContentTable,
    type ContentTableColumnDef,
} from '../../../../components/common/ContentTable';
import MantineIcon from '../../../../components/common/MantineIcon';
import { getDepartmentPath } from '../utils/adoptionNav';
import { formatCoverage, getCoverageNote } from '../utils/departmentDetail';
import {
    buildDepartmentRows,
    formatOwners,
    formatRoleSplit,
    formatShare,
    formatTarget,
    type DepartmentRow,
} from '../utils/departmentRows';
import { formatCount, formatQuantity, type Noun } from '../utils/format';
import { ActivitySparkline } from './ActivitySparkline';
import styles from './DepartmentsTable.module.css';

const INDENT_PX = 24;
const EXPANDER_WIDTH = 22;
const EXPLANATION_MAX_WIDTH = 280;
const BELOW_CHILDREN_WARNING =
    'Headcount is lower than the total of its sub-departments';
const SUB_DEPARTMENTS: Noun = {
    one: 'sub-department',
    other: 'sub-departments',
};

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

// A value whose explanation shows on hover and keyboard focus, marked by a dotted underline
const ExplainedValue: FC<{ value: string; explanation: string }> = ({
    value,
    explanation,
}) => (
    <Tooltip
        label={explanation}
        multiline
        maw={EXPLANATION_MAX_WIDTH}
        events={{ hover: true, focus: true, touch: false }}
    >
        <Text
            component="span"
            fz="sm"
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
    onEdit: (department: DepartmentWithMetrics) => void;
};

export const DepartmentsTable: FC<Props> = ({
    departments,
    canManage,
    onEdit,
}) => {
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const rows = useMemo(
        () => buildDepartmentRows(departments, expanded),
        [departments, expanded],
    );
    const toggle = useCallback((departmentUuid: string) => {
        setExpanded((previous) => {
            const next = new Set(previous);
            if (next.has(departmentUuid)) next.delete(departmentUuid);
            else next.add(departmentUuid);
            return next;
        });
    }, []);

    // Widths add up to fit a 1,100 px table: names and numbers come first, the role split and target give way
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
                                to={getDepartmentPath(
                                    department.departmentUuid,
                                )}
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
                    if (department.effectiveHeadcount === null) {
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
                                    events={{
                                        hover: true,
                                        focus: true,
                                        touch: false,
                                    }}
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
                size: 116,
                Cell: ({ row }) => {
                    const { metrics, effectiveHeadcount } =
                        row.original.department;
                    const coverage = formatCoverage(
                        metrics.coveragePct,
                        metrics.memberCount,
                        effectiveHeadcount,
                    );
                    const note = getCoverageNote(
                        effectiveHeadcount,
                        metrics.memberCount,
                    );
                    return note === null ? (
                        <CellText>{coverage}</CellText>
                    ) : (
                        <ExplainedValue value={coverage} explanation={note} />
                    );
                },
            },
            {
                id: 'active',
                header: 'Active 30d',
                size: 110,
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
                Cell: ({ row }) => (
                    <CellText>
                        {formatOwners(row.original.department.owners)}
                    </CellText>
                ),
            },
            {
                id: 'target',
                header: 'Target',
                size: 114,
                Cell: ({ row }) => (
                    <CellText>{formatTarget(row.original.department)}</CellText>
                ),
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
    }, [canManage, onEdit, toggle]);

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
    });

    return <ContentTable table={table} />;
};
