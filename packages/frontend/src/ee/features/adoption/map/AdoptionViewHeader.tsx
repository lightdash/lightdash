import { Breadcrumbs, Group, SegmentedControl, Text } from '@mantine/core';
import { useId, type FC } from 'react';
import { type ColourBy } from './geometry';
import { COLOUR_BY_LABELS, COLOUR_BY_OPTIONS, isColourBy } from './mapStyles';

type Props = {
    // The breadcrumb's name for screen readers
    label: string;
    // A selected department has its own breadcrumb below the view, so the view's names the organization only
    isOrganization: boolean;
    colourBy: ColourBy;
    onColourByChange: (colourBy: ColourBy) => void;
};

// The breadcrumb and the Color by control over the map and the waffle
export const AdoptionViewHeader: FC<Props> = ({
    label,
    isOrganization,
    colourBy,
    onColourByChange,
}) => {
    const colourByLabelId = useId();
    return (
        <Group
            justify={isOrganization ? 'space-between' : 'flex-end'}
            align="center"
            gap="sm"
        >
            {isOrganization && (
                <Breadcrumbs aria-label={label}>
                    <Text fz="sm" fw={600} aria-current="location">
                        All departments
                    </Text>
                </Breadcrumbs>
            )}
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
