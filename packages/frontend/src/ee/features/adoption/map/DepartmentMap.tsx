import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { IconMinus, IconPlus } from '@tabler/icons-react';
import { select } from 'd3-selection';
import {
    zoom,
    zoomIdentity,
    type D3ZoomEvent,
    type ZoomBehavior,
    type ZoomTransform,
} from 'd3-zoom';
import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type FC,
    type MouseEvent,
} from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import styles from './DepartmentMap.module.css';
import { truncateLabel, type PackedCircle } from './geometry';
import { getLabelLines, placeLabels, type LabelLine } from './mapLayout';
import { OUTLINED_DOT_KINDS } from './mapStyles';
import { type CircleInfo, type MapDot } from './mapView';

const MAX_ZOOM = 12;
const ZOOM_STEP = 1.6;
// Text keeps these sizes on screen at every zoom level
const NAME_FONT_PX = 13;
const DETAIL_FONT_PX = 11;
const PERSON_FONT_PX = 10;
const HALO_PX = 3.5;
const NO_ACCOUNT_SCALE = 0.72;
// Fed to the shared truncation rule: about ten characters
const FIRST_NAME_RADIUS = 36;

const LINE_CLASSES: Record<LabelLine['role'], string> = {
    name: styles.labelName,
    detail: styles.labelDetail,
    nested: styles.labelNested,
};

type ZoomTarget = Parameters<ZoomBehavior<SVGSVGElement, unknown>>[0];

// The zoom typings resolve their own copy of the selection typings, so the selection is retyped once here
const selectZoomTarget = (svg: SVGSVGElement): ZoomTarget =>
    select<SVGSVGElement, unknown>(svg) as unknown as ZoomTarget;

type View = { transform: ZoomTransform; isAnimated: boolean };

type Props = {
    // Pixel size of the drawing area, measured from its container
    width: number;
    height: number;
    circles: PackedCircle[];
    info: Map<string, CircleInfo>;
    dots: MapDot[];
    showNames: boolean;
    ariaLabel: string;
    // Changes when a different part of the organization is drawn, which resets the zoom
    layoutKey: string;
    highlightedUuid: string | null;
    selectedUserUuid: string | null;
    onDepartmentClick: (departmentUuid: string) => void;
    onPersonClick: (userUuid: string) => void;
};

const getMemberName = (member: NonNullable<MapDot['member']>): string =>
    `${member.firstName} ${member.lastName}`.trim() || member.email;

export const DepartmentMap: FC<Props> = ({
    width,
    height,
    circles,
    info,
    dots,
    showNames,
    ariaLabel,
    layoutKey,
    highlightedUuid,
    selectedUserUuid,
    onDepartmentClick,
    onPersonClick,
}) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    const [view, setView] = useState<View>({
        transform: zoomIdentity,
        isAnimated: false,
    });

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return undefined;
        const behaviour = zoom<SVGSVGElement, unknown>()
            .extent([
                [0, 0],
                [width, height],
            ])
            .translateExtent([
                [0, 0],
                [width, height],
            ])
            .scaleExtent([1, MAX_ZOOM])
            .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) =>
                setView({
                    transform: event.transform,
                    // Buttons and resets carry no pointer event
                    isAnimated: !event.sourceEvent,
                }),
            );
        zoomRef.current = behaviour;
        const target = selectZoomTarget(svg);
        behaviour(target);
        target.on('dblclick.zoom', null);
        return () => {
            target.on('.zoom', null);
        };
    }, [width, height]);

    const fit = useCallback(() => {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
            zoomRef.current.transform(selectZoomTarget(svg), zoomIdentity);
        }
    }, []);
    const zoomBy = useCallback((factor: number) => {
        const svg = svgRef.current;
        if (svg && zoomRef.current) {
            zoomRef.current.scaleBy(selectZoomTarget(svg), factor);
        }
    }, []);

    // A different part of the organization, or a resized area, starts from the fitted view
    useEffect(() => {
        fit();
    }, [fit, layoutKey, width, height]);

    const { k } = view.transform;
    const labels = useMemo(
        () => placeLabels(circles, info, k, { width, height }),
        [circles, info, k, width, height],
    );

    const handleCircleClick = (event: MouseEvent<SVGGElement>) => {
        const { target } = event;
        if (!(target instanceof SVGElement)) return;
        const { department } = target.dataset;
        if (department) onDepartmentClick(department);
    };
    const handleDotClick = (event: MouseEvent<SVGGElement>) => {
        const { target } = event;
        if (!(target instanceof SVGElement)) return;
        const { user } = target.dataset;
        if (user) onPersonClick(user);
    };

    return (
        <>
            <svg
                ref={svgRef}
                className={styles.svg}
                width={width}
                height={height}
                role="img"
                aria-label={ariaLabel}
            >
                <g
                    className={styles.viewport}
                    data-animated={view.isAnimated || undefined}
                    transform={view.transform.toString()}
                >
                    <g onClick={handleCircleClick}>
                        {circles.map((circle) => (
                            <circle
                                key={circle.id}
                                className={styles.circle}
                                data-kind={circle.kind}
                                data-department={
                                    circle.kind === 'department'
                                        ? (circle.departmentUuid ?? undefined)
                                        : undefined
                                }
                                data-nested={circle.depth > 1 || undefined}
                                data-empty={!circle.hasMembers || undefined}
                                data-no-headcount={
                                    !circle.hasHeadcount || undefined
                                }
                                data-highlighted={
                                    (circle.kind === 'department' &&
                                        circle.departmentUuid ===
                                            highlightedUuid) ||
                                    undefined
                                }
                                cx={circle.x}
                                cy={circle.y}
                                r={circle.r}
                            >
                                <title>
                                    {info.get(circle.id)?.description ??
                                        circle.name}
                                </title>
                            </circle>
                        ))}
                    </g>
                    <g className={styles.dots} onClick={handleDotClick}>
                        {dots.map((dot) => {
                            const isOutlined = OUTLINED_DOT_KINDS.has(dot.kind);
                            const strokeWidth = isOutlined
                                ? Math.min(1.6, dot.r * 0.45)
                                : 0;
                            const radius =
                                dot.kind === 'noAccount'
                                    ? dot.r * NO_ACCOUNT_SCALE
                                    : dot.r - strokeWidth / 2;
                            return (
                                <circle
                                    key={dot.key}
                                    data-dot={dot.kind}
                                    data-user={dot.member?.userUuid}
                                    data-selected={
                                        (dot.member !== null &&
                                            dot.member.userUuid ===
                                                selectedUserUuid) ||
                                        undefined
                                    }
                                    cx={dot.x}
                                    cy={dot.y}
                                    r={radius}
                                    strokeWidth={
                                        isOutlined ? strokeWidth : undefined
                                    }
                                >
                                    {dot.member && (
                                        <title>
                                            {getMemberName(dot.member)}
                                        </title>
                                    )}
                                </circle>
                            );
                        })}
                    </g>
                    {labels.flatMap((label) =>
                        getLabelLines(label, k).map((line) => (
                            <text
                                key={`${label.id}:${line.role}`}
                                className={`${styles.label} ${LINE_CLASSES[line.role]}`}
                                x={line.x}
                                y={line.y}
                                textAnchor={line.anchor}
                                fontSize={
                                    (line.role === 'name'
                                        ? NAME_FONT_PX
                                        : DETAIL_FONT_PX) / k
                                }
                                strokeWidth={HALO_PX / k}
                            >
                                {line.text}
                            </text>
                        )),
                    )}
                    {showNames &&
                        dots.map((dot) =>
                            dot.member === null ? null : (
                                <text
                                    key={dot.key}
                                    className={`${styles.label} ${styles.personName}`}
                                    textAnchor="middle"
                                    x={dot.x}
                                    y={dot.y + dot.r + (PERSON_FONT_PX + 1) / k}
                                    fontSize={PERSON_FONT_PX / k}
                                    strokeWidth={HALO_PX / k}
                                >
                                    {truncateLabel(
                                        dot.member.firstName ||
                                            dot.member.email,
                                        FIRST_NAME_RADIUS,
                                    )}
                                </text>
                            ),
                        )}
                </g>
            </svg>
            <Group gap={4} className={styles.controls}>
                <Tooltip label="Zoom in">
                    <ActionIcon
                        variant="default"
                        aria-label="Zoom in"
                        onClick={() => zoomBy(ZOOM_STEP)}
                    >
                        <MantineIcon icon={IconPlus} />
                    </ActionIcon>
                </Tooltip>
                <Tooltip label="Zoom out">
                    <ActionIcon
                        variant="default"
                        aria-label="Zoom out"
                        onClick={() => zoomBy(1 / ZOOM_STEP)}
                    >
                        <MantineIcon icon={IconMinus} />
                    </ActionIcon>
                </Tooltip>
                <Button variant="default" size="compact-sm" onClick={fit}>
                    Fit
                </Button>
            </Group>
        </>
    );
};
