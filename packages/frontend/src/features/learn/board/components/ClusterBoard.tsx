import { type LearnCatalogueEntry } from '@lightdash/common';
import { useElementSize } from '@mantine/hooks';
import { useMemo, type FC, type RefObject } from 'react';
import { type Rollup } from '../../model';
import { type AskHighlights } from '../ask';
import { nodeAskState } from '../askView';
import {
    BOARD_WIDTH,
    buildLayout,
    seatMap,
    type LayoutModule,
    type Seat,
} from '../layout';
import {
    GROUP_LABEL,
    groupOf,
    isUnlocked,
    moduleDone,
    moduleProgress,
} from '../model';
import { resolveMotion } from '../motion';
import { BoardNode } from './BoardNode';
import styles from './LearnBoard.module.css';

export type ClusterBoardProps = {
    entries: LearnCatalogueEntry[];
    held: string[];
    prevHeld: string[] | null;
    rollups: Map<string, Rollup>;
    selectedId: string | null;
    nextUpId: string | null;
    origin: Seat | null;
    burst: boolean;
    reducedMotion: boolean;
    highlights: AskHighlights | null;
    onSelect: (id: string) => void;
    boardRef: RefObject<HTMLDivElement | null>;
};

const toLayoutModules = (
    entries: LearnCatalogueEntry[],
    held: string[],
): LayoutModule[] =>
    entries.map((entry) => ({
        id: entry.id,
        group: groupOf(entry),
        unlocked: isUnlocked(entry, held),
    }));

export const ClusterBoard: FC<ClusterBoardProps> = ({
    entries,
    held,
    prevHeld,
    rollups,
    selectedId,
    nextUpId,
    origin,
    burst,
    reducedMotion,
    highlights,
    onSelect,
    boardRef,
}) => {
    const layout = useMemo(
        () => buildLayout(toLayoutModules(entries, held)),
        [entries, held],
    );
    // The geometry is fixed at 1120px; scale it down when the column is narrower.
    const { ref: viewportRef, width: viewportWidth } = useElementSize();
    const scale =
        viewportWidth > 0 ? Math.min(1, viewportWidth / BOARD_WIDTH) : 1;
    const prevSeats = useMemo(
        () => (prevHeld ? seatMap(toLayoutModules(entries, prevHeld)) : null),
        [entries, prevHeld],
    );
    const byId = useMemo(
        () => new Map(entries.map((e) => [e.id, e])),
        [entries],
    );

    const captionProgress = (group: string): number => {
        const members = entries.filter(
            (e) => groupOf(e) === group && isUnlocked(e, held),
        );
        if (members.length === 0) return 0;
        const sum = members.reduce(
            (acc, e) => acc + moduleProgress(e, rollups.get(e.id)),
            0,
        );
        return Math.round((sum / members.length) * 100);
    };

    return (
        <div
            ref={viewportRef}
            className={styles.boardViewport}
            style={{ height: layout.height * scale }}
        >
            <div
                ref={boardRef}
                className={`${styles.board} ${styles.boardScaled}`}
                style={{
                    height: layout.height,
                    transform: scale < 1 ? `scale(${scale})` : undefined,
                }}
                data-testid="learn-board"
            >
                <svg
                    className={styles.connectors}
                    width={layout.width}
                    height={layout.height}
                >
                    {layout.connectors.map((c, i) => (
                        <line
                            key={i}
                            x1={c.x1}
                            y1={c.y1}
                            x2={c.x2}
                            y2={c.y2}
                            className={
                                c.kind === 'trunk'
                                    ? styles.connectorTrunk
                                    : styles.connectorRing
                            }
                        />
                    ))}
                </svg>
                {layout.captions.map((caption) => {
                    const pct = captionProgress(caption.group);
                    return (
                        <div
                            key={caption.group}
                            className={styles.caption}
                            style={{ left: caption.x, top: caption.y }}
                        >
                            <span className={styles.captionName}>
                                {GROUP_LABEL[caption.group]}
                            </span>
                            <div
                                className={styles.captionBar}
                                role="progressbar"
                                aria-label={`${GROUP_LABEL[caption.group]} progress`}
                                aria-valuenow={pct}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <div
                                    className={styles.captionFill}
                                    style={{ width: `${pct}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
                {layout.nodes.map((node) => {
                    const entry = byId.get(node.id);
                    if (!entry) return null;
                    const askState = nodeAskState(node.id, highlights);
                    const flight = resolveMotion({
                        unlocked: node.unlocked,
                        wasUnlocked: prevHeld
                            ? isUnlocked(entry, prevHeld)
                            : node.unlocked,
                        seat: { x: node.x, y: node.y },
                        prevSeat: prevSeats?.get(node.id) ?? null,
                        origin,
                        burst,
                        reducedMotion,
                    });
                    // A locked match is parked at its cluster centre: it shows
                    // an answer, so it takes no part in the role-switch flight.
                    const motion =
                        askState === 'locked-match'
                            ? {
                                  ...flight,
                                  x: node.x,
                                  y: node.y,
                                  animate: false,
                              }
                            : flight;
                    return (
                        <BoardNode
                            key={node.id}
                            id={node.id}
                            title={entry.title}
                            lessonCount={entry.lessonCount}
                            unlocked={node.unlocked}
                            progress={moduleProgress(
                                entry,
                                rollups.get(entry.id),
                            )}
                            done={moduleDone(rollups.get(entry.id))}
                            selected={selectedId === node.id}
                            nextUp={nextUpId === node.id}
                            index={node.index}
                            motion={motion}
                            askState={askState}
                            onSelect={onSelect}
                        />
                    );
                })}
            </div>
        </div>
    );
};
