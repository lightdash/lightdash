import { type DepartmentWithMetrics } from '@lightdash/common';
import {
    Anchor,
    Breadcrumbs,
    Group,
    SegmentedControl,
    Text,
} from '@mantine/core';
import { useId, type FC, type RefObject } from 'react';
import styles from './AdoptionMap.module.css';
import { type ColourBy } from './geometry';
import { COLOUR_BY_LABELS, COLOUR_BY_OPTIONS, isColourBy } from './mapStyles';

const ROOT_NAME = 'All departments';

type Props = {
    // The breadcrumb's name for screen readers
    label: string;
    // Ancestors from the top down, ending at the current department; empty for the whole organization
    trail: DepartmentWithMetrics[];
    currentUuid: string | null;
    // The current crumb is text rather than a button, so a view can move focus to it
    currentCrumbRef: RefObject<HTMLParagraphElement | null>;
    onCrumbClick: (departmentUuid: string | null) => void;
    colourBy: ColourBy;
    onColourByChange: (colourBy: ColourBy) => void;
};

// The breadcrumb and the Color by control over the map and the waffle
export const AdoptionViewHeader: FC<Props> = ({
    label,
    trail,
    currentUuid,
    currentCrumbRef,
    onCrumbClick,
    colourBy,
    onColourByChange,
}) => {
    const colourByLabelId = useId();
    const crumbs = [
        { uuid: null, name: ROOT_NAME },
        ...trail.map((department) => ({
            uuid: department.departmentUuid,
            name: department.name,
        })),
    ];
    return (
        <Group justify="space-between" align="center" gap="sm">
            {/* The map's Escape key goes up a level from these crumbs */}
            <Breadcrumbs aria-label={label} data-map-navigation>
                {crumbs.map(({ uuid, name }) =>
                    uuid === currentUuid ? (
                        <Text
                            key={uuid ?? 'root'}
                            ref={currentCrumbRef}
                            className={styles.crumb}
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
                            onClick={() => onCrumbClick(uuid)}
                        >
                            {name}
                        </Anchor>
                    ),
                )}
            </Breadcrumbs>
            <Group gap="xs" wrap="nowrap">
                <Text fz="xs" c="dimmed" id={colourByLabelId}>
                    Color by
                </Text>
                <SegmentedControl
                    size="xs"
                    aria-labelledby={colourByLabelId}
                    value={colourBy}
                    onChange={(value) => {
                        if (isColourBy(value)) onColourByChange(value);
                    }}
                    data={COLOUR_BY_OPTIONS.map((value) => ({
                        value,
                        label: COLOUR_BY_LABELS[value],
                    }))}
                />
            </Group>
        </Group>
    );
};
