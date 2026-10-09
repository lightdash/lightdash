import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import { formatCount } from '../utils/format';
import styles from './AdoptionMap.module.css';
import mapStyles from './DepartmentMap.module.css';
import { type ColourBy, type DotKind } from './geometry';
import {
    DOT_LABELS,
    EDGED_DOT_KINDS,
    LEGEND_KINDS,
    OUTLINED_DOT_KINDS,
} from './mapStyles';

type Props = {
    colourBy: ColourBy;
    counts: Map<DotKind, number>;
    // The whole organization is in view, where only the people placed in a department are counted
    isOrganizationView: boolean;
    hasEmptyDepartment: boolean;
    hasDepartmentWithoutHeadcount: boolean;
    hasEnlargedCircle: boolean;
    // Sub-departments are drawn inside their department, scaled to fill it
    hasSubDepartments: boolean;
    areDotsHidden: boolean;
    haveNamesFailed: boolean;
    dotLimit: number;
};

// A person's dot as the map draws it; the panel beside the map keys its bar with the same ones
export const DotSwatch: FC<{ kind: DotKind }> = ({ kind }) => (
    <svg className={mapStyles.swatch} width={10} height={10} aria-hidden>
        <g className={mapStyles.dots}>
            <circle
                data-dot={kind}
                cx={5}
                cy={5}
                r={kind === 'noAccount' ? 3.5 : 4.2}
                strokeWidth={
                    OUTLINED_DOT_KINDS.has(kind)
                        ? 1.6
                        : EDGED_DOT_KINDS.has(kind)
                          ? 1
                          : undefined
                }
            />
        </g>
    </svg>
);

const RingSwatch: FC<{ variant: 'empty' | 'noHeadcount' }> = ({ variant }) => (
    <svg className={mapStyles.swatch} width={14} height={14} aria-hidden>
        <circle
            className={mapStyles.circle}
            data-empty={variant === 'empty' || undefined}
            data-no-headcount={variant === 'noHeadcount' || undefined}
            cx={7}
            cy={7}
            r={6}
        />
    </svg>
);

export const MapLegend: FC<Props> = ({
    colourBy,
    counts,
    isOrganizationView,
    hasEmptyDepartment,
    hasDepartmentWithoutHeadcount,
    hasEnlargedCircle,
    hasSubDepartments,
    areDotsHidden,
    haveNamesFailed,
    dotLimit,
}) => (
    <Stack gap={6} className={styles.footer}>
        <ul className={styles.legend} aria-label="Legend">
            {LEGEND_KINDS[colourBy].map((kind) => (
                <li key={kind} className={styles.legendItem}>
                    <DotSwatch kind={kind} />
                    <Text fz="xs">{DOT_LABELS[kind]}</Text>
                    <Text fz="xs" c="dimmed" className={styles.count}>
                        {formatCount(counts.get(kind) ?? 0)}
                    </Text>
                </li>
            ))}
            {hasEmptyDepartment && (
                <li className={styles.legendItem}>
                    <RingSwatch variant="empty" />
                    <Text fz="xs">Nobody on Lightdash yet</Text>
                </li>
            )}
            {hasDepartmentWithoutHeadcount && (
                <li className={styles.legendItem}>
                    <RingSwatch variant="noHeadcount" />
                    <Text fz="xs">No headcount set</Text>
                </li>
            )}
        </ul>
        {isOrganizationView && (
            <Text fz="xs" c="dimmed">
                Legend counts people placed in a department
            </Text>
        )}
        {areDotsHidden && (
            <Text fz="xs" c="dimmed">
                {`Dots are hidden above ${formatCount(dotLimit)} people. Open a department to see its people`}
            </Text>
        )}
        {hasSubDepartments && (
            <Text fz="xs" c="dimmed">
                Circles are to scale within their department
            </Text>
        )}
        {hasEnlargedCircle && (
            <Text fz="xs" c="dimmed">
                The smallest circles are enlarged so you can select them, which
                means they are not to scale
            </Text>
        )}
        {haveNamesFailed && (
            <Text fz="xs" c="dimmed">
                Names could not be loaded
            </Text>
        )}
        <Text fz="xs" c="dimmed">
            Hold Ctrl or ⌘ and scroll to zoom, drag to move, select a department
            to open it
        </Text>
    </Stack>
);
