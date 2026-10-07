import { type DepartmentWithMetrics } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Box,
    Button,
    Group,
    Stack,
    Text,
    Tooltip,
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
import {
    buildDepartmentRows,
    formatOwners,
    formatRoleSplit,
    formatShare,
    formatTarget,
    type DepartmentRow,
} from '../utils/departmentRows';
import { ActivitySparkline } from './ActivitySparkline';

const INDENT_PX = 24;
const BELOW_CHILDREN_WARNING =
    'Headcount is lower than the total of its sub-departments';

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

    const columns = useMemo<ContentTableColumnDef<DepartmentRow>[]>(() => {
        const dataColumns: ContentTableColumnDef<DepartmentRow>[] = [
            {
                id: 'name',
                header: 'Department',
                size: 300,
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
                                <Box w={22} />
                            )}
                            <Anchor
                                component={Link}
                                to={getDepartmentPath(
                                    department.departmentUuid,
                                )}
                                fz="sm"
                                fw={depth === 0 ? 600 : 400}
                            >
                                {department.name}
                            </Anchor>
                            {!canExpand && childCount > 0 && (
                                <Text fz="xs" c="dimmed">
                                    {childCount} sub-department
                                    {childCount === 1 ? '' : 's'}
                                </Text>
                            )}
                        </Group>
                    );
                },
            },
            {
                id: 'headcount',
                header: 'Headcount',
                size: 150,
                Cell: ({ row }) => {
                    const { department } = row.original;
                    if (department.effectiveHeadcount === null) {
                        return canManage ? (
                            <Button
                                variant="subtle"
                                size="compact-xs"
                                onClick={() => onEdit(department)}
                            >
                                Add headcount
                            </Button>
                        ) : (
                            <Text fz="sm" c="dimmed">
                                –
                            </Text>
                        );
                    }
                    return (
                        <Stack gap={0}>
                            <Group gap="xs" wrap="nowrap">
                                <Text fz="sm">
                                    {department.effectiveHeadcount}
                                </Text>
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
                            {department.headcountNote !== null && (
                                <Text fz="xs" c="dimmed" lineClamp={1}>
                                    {department.headcountNote}
                                </Text>
                            )}
                        </Stack>
                    );
                },
            },
            {
                id: 'coverage',
                header: 'Coverage',
                size: 120,
                Cell: ({ row }) => (
                    <Text fz="sm">
                        {formatShare(
                            row.original.department.metrics.coveragePct,
                            row.original.department.metrics.memberCount,
                        )}
                    </Text>
                ),
            },
            {
                id: 'active',
                header: 'Active 30d',
                size: 120,
                Cell: ({ row }) => (
                    <Text fz="sm">
                        {formatShare(
                            row.original.department.metrics.activePct,
                            row.original.department.metrics.activeCount30d,
                        )}
                    </Text>
                ),
            },
            {
                id: 'roles',
                header: 'Roles',
                size: 300,
                Cell: ({ row }) => (
                    <Text fz="xs" c="dimmed">
                        {formatRoleSplit(
                            row.original.department.metrics.roleSplit,
                        )}
                    </Text>
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
                size: 160,
                Cell: ({ row }) => (
                    <Text fz="sm">
                        {formatOwners(row.original.department.owners)}
                    </Text>
                ),
            },
            {
                id: 'target',
                header: 'Target',
                size: 190,
                Cell: ({ row }) => (
                    <Text fz="sm">{formatTarget(row.original.department)}</Text>
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
                      size: 56,
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
