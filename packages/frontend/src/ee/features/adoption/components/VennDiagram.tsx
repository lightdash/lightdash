import { type DepartmentOverlaps } from '@lightdash/common';
import { Group, Stack, Text } from '@mantine/core';
import { useId, type FC, type KeyboardEvent } from 'react';
import {
    describeVennRegion,
    getVennSets,
    getVennTitle,
    isSameSelection,
    type OverlapSelection,
} from '../utils/departmentDetail';
import { formatCount } from '../utils/format';
import { getVennLayout } from '../utils/vennGeometry';
import styles from './OverlapsSection.module.css';

const SWATCH_SIZE = 12;
const NAME_MAX_WIDTH = 200;

type Props = {
    departmentUuid: string; // drawn first, at the top
    venn: NonNullable<DepartmentOverlaps['venn']>;
    selection: OverlapSelection | null;
    onSelect: (selection: OverlapSelection | null) => void;
};

// Drawn by hand: the circles are all one size, so the counts carry the sizes
export const VennDiagram: FC<Props> = ({
    departmentUuid,
    venn,
    selection,
    onSelect,
}) => {
    const titleId = useId();
    const sets = getVennSets(venn.sets, departmentUuid);
    if (sets === null) return null;
    const layout = getVennLayout(sets.length === 2 ? 2 : 3);
    const regions = layout.regions.map((shape) => ({
        shape,
        key: shape.positions.join('-'),
        ...describeVennRegion(sets, venn.regions, shape.positions),
    }));
    const handleKeyDown = (
        event: KeyboardEvent<SVGPathElement>,
        next: OverlapSelection | null,
    ) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect(next);
        }
    };

    return (
        <Stack gap="sm" align="center">
            <svg
                className={styles.venn}
                width={layout.width}
                height={layout.height}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="group"
                aria-labelledby={titleId}
            >
                <title id={titleId}>{getVennTitle(sets)}</title>
                {layout.circles.map((circle, i) => (
                    <circle
                        key={sets[i].departmentUuid}
                        className={styles.outline}
                        data-set={i}
                        cx={circle.cx}
                        cy={circle.cy}
                        r={circle.r}
                    />
                ))}
                {regions.map(({ shape, key, name, selection: listed }) => {
                    if (listed === null) {
                        return (
                            <path
                                key={key}
                                className={styles.region}
                                d={shape.path}
                                data-muted
                                role="img"
                                aria-label={name}
                            />
                        );
                    }
                    const isSelected =
                        selection !== null &&
                        isSameSelection(selection, listed);
                    // Choosing the chosen region again shows everyone
                    const next = isSelected ? null : listed;
                    return (
                        <path
                            key={key}
                            className={styles.region}
                            d={shape.path}
                            data-depth={shape.positions.length}
                            role="button"
                            tabIndex={0}
                            aria-label={name}
                            aria-pressed={isSelected}
                            onClick={() => onSelect(next)}
                            onKeyDown={(event) => handleKeyDown(event, next)}
                        />
                    );
                })}
                {regions.map(({ shape, key, people, selection: listed }) => (
                    <text
                        key={key}
                        className={styles.count}
                        data-muted={listed === null || undefined}
                        x={shape.label.x}
                        y={shape.label.y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        aria-hidden="true"
                    >
                        {formatCount(people)}
                    </text>
                ))}
            </svg>
            <Group
                component="ul"
                className={styles.key}
                gap="md"
                justify="center"
            >
                {sets.map((set, i) => (
                    <Group
                        component="li"
                        key={set.departmentUuid}
                        gap={6}
                        wrap="nowrap"
                        miw={0}
                    >
                        <svg
                            className={styles.swatch}
                            width={SWATCH_SIZE}
                            height={SWATCH_SIZE}
                            viewBox={`0 0 ${SWATCH_SIZE} ${SWATCH_SIZE}`}
                            aria-hidden="true"
                        >
                            <circle
                                className={styles.outline}
                                data-set={i}
                                cx={SWATCH_SIZE / 2}
                                cy={SWATCH_SIZE / 2}
                                r={SWATCH_SIZE / 2 - 1}
                            />
                        </svg>
                        <Text
                            fz="xs"
                            truncate="end"
                            maw={NAME_MAX_WIDTH}
                            title={set.name}
                        >
                            {set.name}
                        </Text>
                    </Group>
                ))}
            </Group>
        </Stack>
    );
};
