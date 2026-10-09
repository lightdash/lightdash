import {
    type AdoptionMetrics,
    type DepartmentRef,
    type DepartmentWithMetrics,
} from '@lightdash/common';
import {
    Anchor,
    Box,
    Breadcrumbs,
    Button,
    Group,
    Pill,
    Stack,
    Text,
    Title,
} from '@mantine/core';
import { IconAlertCircle, IconPencil, IconUsers } from '@tabler/icons-react';
import { useCallback, useMemo, useRef, type FC } from 'react';
import { Link, useSearchParams } from 'react-router';
import { validate as isUuid } from 'uuid';
import EmptyStateLoader from '../../../../components/common/EmptyStateLoader';
import MantineIcon from '../../../../components/common/MantineIcon';
import SuboptimalState from '../../../../components/common/SuboptimalState/SuboptimalState';
import { useDepartmentDetail } from '../../../hooks/useOrgDepartments';
import mapStyles from '../map/AdoptionMap.module.css';
import { type ColourBy, type DotKind } from '../map/geometry';
import {
    BreakdownBar,
    BreakdownLegend,
    CoverageRowList,
} from '../map/MapInspector';
import { withSelectedDepartment } from '../utils/adoptionNav';
import {
    formatDepartmentCounts,
    getWeeklyComparison,
} from '../utils/departmentDetail';
import {
    getCoverageRows,
    getDepartmentBreakdown,
    getDirectRow,
} from '../utils/peopleBreakdown';
import { WeeklyActiveChart } from './WeeklyActiveChart';

// The rows keep the panel's widths, so their bars stay short beside a full-width page
const SUB_DEPARTMENTS_MAX_WIDTH = 560;

const getUnavailableCopy = (
    statusCode: number | undefined,
    message: string | undefined,
): { title: string; description: string | undefined } => {
    if (statusCode === 404) {
        return {
            title: 'Department not found',
            description:
                'It may have been deleted, or it may not be in your organization',
        };
    }
    if (statusCode === 403) {
        return {
            title: "You don't have access to this department",
            description: 'Ask an admin if you think you should',
        };
    }
    return { title: "This department isn't available", description: message };
};

const Unavailable: FC<{
    statusCode: number | undefined;
    message: string | undefined;
    onBack: () => void;
}> = ({ statusCode, message, onBack }) => {
    const { title, description } = getUnavailableCopy(statusCode, message);
    return (
        <SuboptimalState
            icon={IconAlertCircle}
            title={title}
            description={description}
            action={
                <Button variant="default" onClick={onBack}>
                    Back to organization
                </Button>
            }
        />
    );
};

type HeaderProps = {
    department: DepartmentWithMetrics;
    ancestors: DepartmentRef[];
    canManage: boolean;
    onEdit: () => void;
    onPlacePeople: () => void;
};

// Where the department sits, each level a link that selects it, then its name, its owners and what an admin can do
const DepartmentHeader: FC<HeaderProps> = ({
    department,
    ancestors,
    canManage,
    onEdit,
    onPlacePeople,
}) => {
    const [searchParams] = useSearchParams();
    const linkTo = (departmentUuid: string | null) =>
        `?${withSelectedDepartment(searchParams, departmentUuid).toString()}`;
    // Focus moves to the name as soon as it shows, so the keyboard and a screen reader follow the selection
    const hasFocusedRef = useRef(false);
    const focusOnce = useCallback((heading: HTMLHeadingElement | null) => {
        if (heading === null || hasFocusedRef.current) return;
        hasFocusedRef.current = true;
        heading.focus();
    }, []);
    return (
        <Stack gap="xs">
            <Box component="nav" aria-label="Selected department">
                <Breadcrumbs>
                    <Anchor
                        component={Link}
                        to={linkTo(null)}
                        fz="sm"
                        c="dimmed"
                    >
                        Organization
                    </Anchor>
                    {ancestors.map((ancestor) => (
                        <Anchor
                            key={ancestor.departmentUuid}
                            component={Link}
                            to={linkTo(ancestor.departmentUuid)}
                            fz="sm"
                            c="dimmed"
                        >
                            {ancestor.name}
                        </Anchor>
                    ))}
                    <Text fz="sm" fw={600} aria-current="location">
                        {department.name}
                    </Text>
                </Breadcrumbs>
            </Box>
            <Group
                justify="space-between"
                align="flex-start"
                gap="md"
                wrap="nowrap"
            >
                <Stack gap={6} miw={0}>
                    <Title
                        order={4}
                        ref={focusOnce}
                        tabIndex={-1}
                        className={mapStyles.heading}
                    >
                        {department.name}
                    </Title>
                    {department.owners.length > 0 && (
                        <Group gap={6} role="list" aria-label="Owners">
                            {department.owners.map((owner) => (
                                <Pill
                                    key={`${owner.type}:${owner.uuid}`}
                                    role="listitem"
                                >
                                    {owner.name}
                                </Pill>
                            ))}
                        </Group>
                    )}
                </Stack>
                {canManage && (
                    <Group gap="xs" wrap="nowrap">
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<MantineIcon icon={IconPencil} />}
                            onClick={onEdit}
                        >
                            Edit department
                        </Button>
                        <Button
                            size="xs"
                            variant="default"
                            leftSection={<MantineIcon icon={IconUsers} />}
                            onClick={onPlacePeople}
                        >
                            Place people
                        </Button>
                    </Group>
                )}
            </Group>
            {department.headcountBelowChildren && (
                <Text fz="sm" c="yellow">
                    The headcount entered is below its sub-departments and its
                    own people, so that total counts instead
                </Text>
            )}
        </Stack>
    );
};

type Props = {
    // The department the link selects; anything but a uuid is a department not found, and nothing is requested
    departmentUuid: string;
    // The organization's numbers, which the trend compares the department with
    organization: AdoptionMetrics;
    colourBy: ColourBy;
    // The view's own mark for each kind of person, keying the bar as the panel's is keyed
    keySwatch: FC<{ kind: DotKind }>;
    canManage: boolean;
    // While its delete is in flight the department answers 404, so what was shown stays until it is deselected
    isDeleting: boolean;
    onSelect: (departmentUuid: string | null) => void;
    onEdit: (department: DepartmentWithMetrics) => void;
    onPlacePeople: () => void;
};

// The department selected on the page, below the view: where it sits, its people as the map colours them, its trend
// and its sub-departments. Its loading and errors stay here, so the view above never waits for them
export const SelectedDepartment: FC<Props> = ({
    departmentUuid,
    organization,
    colourBy,
    keySwatch,
    canManage,
    isDeleting,
    onSelect,
    onEdit,
    onPlacePeople,
}) => {
    const requestedUuid = isUuid(departmentUuid) ? departmentUuid : undefined;
    const detail = useDepartmentDetail(requestedUuid);
    const weeks = useMemo(
        () =>
            detail.data
                ? getWeeklyComparison(
                      detail.data.weeklyActive,
                      detail.data.department.metrics.memberCount,
                      organization,
                  )
                : [],
        [detail.data, organization],
    );
    const backToOrganization = () => onSelect(null);

    if (requestedUuid === undefined) {
        return (
            <Unavailable
                statusCode={404}
                message={undefined}
                onBack={backToOrganization}
            />
        );
    }
    if (detail.isInitialLoading) {
        return <EmptyStateLoader title="Loading department" />;
    }
    if ((detail.isError && !isDeleting) || !detail.data) {
        return (
            <Unavailable
                statusCode={detail.error?.error.statusCode}
                message={detail.error?.error.message}
                onBack={backToOrganization}
            />
        );
    }

    const { department, ancestors, children } = detail.data;
    const breakdown = getDepartmentBreakdown(department, colourBy);
    const direct = getDirectRow(department, children, colourBy);

    return (
        // The map's root sets the colours the bars and keys read
        <Stack gap="lg" className={mapStyles.root}>
            <DepartmentHeader
                department={department}
                ancestors={ancestors}
                canManage={canManage}
                onEdit={() => onEdit(department)}
                onPlacePeople={onPlacePeople}
            />

            <Stack gap="md">
                <Stack gap="xs">
                    <BreakdownBar breakdown={breakdown} size="lg" />
                    <BreakdownLegend
                        breakdown={breakdown}
                        hasHeadcount={department.hasHeadcount}
                        keySwatch={keySwatch}
                    />
                </Stack>
                <Stack gap="xs">
                    <Title order={5}>Weekly active people</Title>
                    {department.metrics.memberCount === 0 && (
                        <Text fz="xs" c="dimmed">
                            No comparison: nobody on Lightdash yet
                        </Text>
                    )}
                    <WeeklyActiveChart weeks={weeks} />
                </Stack>
                <Text fz="sm" className={mapStyles.count}>
                    {formatDepartmentCounts(department)}
                </Text>
            </Stack>

            {children.length > 0 && (
                <Stack gap="xs">
                    <Title order={5}>Sub-departments</Title>
                    <Box maw={SUB_DEPARTMENTS_MAX_WIDTH}>
                        <CoverageRowList
                            rows={getCoverageRows(children, colourBy)}
                            direct={
                                direct === null
                                    ? null
                                    : { name: department.name, row: direct }
                            }
                            canManage={canManage}
                            onDepartmentClick={onSelect}
                        />
                    </Box>
                </Stack>
            )}
        </Stack>
    );
};
