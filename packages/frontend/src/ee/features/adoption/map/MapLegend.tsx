import { Stack, Text } from '@mantine/core';
import { type FC } from 'react';
import styles from './AdoptionMap.module.css';
import mapStyles from './DepartmentMap.module.css';
import { type ColourBy, type DotKind } from './geometry';
import { DOT_LABELS, LEGEND_KINDS, OUTLINED_DOT_KINDS } from './mapStyles';
import { formatCount } from './mapView';

type Props = {
    colourBy: ColourBy;
    counts: Map<DotKind, number>;
    hasEmptyDepartment: boolean;
    hasDepartmentWithoutHeadcount: boolean;
    hasEnlargedCircle: boolean;
    areDotsHidden: boolean;
    haveNamesFailed: boolean;
    dotLimit: number;
};

const DotSwatch: FC<{ kind: DotKind }> = ({ kind }) => (
    <svg className={mapStyles.swatch} width={10} height={10} aria-hidden>
        <g className={mapStyles.dots}>
            <circle
                data-dot={kind}
                cx={5}
                cy={5}
                r={kind === 'noAccount' ? 3.5 : 4.2}
                strokeWidth={OUTLINED_DOT_KINDS.has(kind) ? 1.6 : undefined}
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
    hasEmptyDepartment,
    hasDepartmentWithoutHeadcount,
    hasEnlargedCircle,
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
        <Text fz="xs" c="dimmed">
            {areDotsHidden
                ? `Dots are hidden above ${formatCount(dotLimit)} people. Open a department to see its people`
                : 'Dots show how many people are active, not who they are. Open a department to see its people'}
        </Text>
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
