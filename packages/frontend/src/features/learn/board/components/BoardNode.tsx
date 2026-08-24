import { type FC } from 'react';
import { NODE_SIZE } from '../layout';
import { plural } from '../model';
import { NODE_TRANSITION, staggerMs, type NodeMotion } from '../motion';
import { progressFill } from '../tokens';
import styles from './LearnBoard.module.css';

export type BoardNodeProps = {
    id: string;
    title: string;
    lessonCount: number;
    unlocked: boolean;
    progress: number;
    done: boolean;
    selected: boolean;
    nextUp: boolean;
    index: number;
    motion: NodeMotion;
    onSelect: (id: string) => void;
};

export const BoardNode: FC<BoardNodeProps> = ({
    id,
    title,
    lessonCount,
    unlocked,
    progress,
    done,
    selected,
    nextUp,
    index,
    motion,
    onSelect,
}) => {
    const showPulse = nextUp && unlocked && !selected;
    // Ring/glow/label colour are enumerable states, so they live as CSS
    // modifier classes; only continuous per-node values stay inline.
    const className = [
        styles.node,
        !unlocked && styles.nodeLocked,
        unlocked && done && styles.nodeDone,
        selected && styles.nodeSelected,
        showPulse && styles.nodeNextUp,
    ]
        .filter(Boolean)
        .join(' ');
    return (
        <button
            type="button"
            aria-label={`${title}, ${
                unlocked && done ? 'complete' : plural(lessonCount, 'lesson')
            }`}
            aria-pressed={selected}
            aria-hidden={!unlocked}
            disabled={!unlocked}
            tabIndex={unlocked ? 0 : -1}
            className={className}
            style={{
                left: motion.x - NODE_SIZE / 2,
                top: motion.y - NODE_SIZE / 2,
                background: unlocked ? progressFill(progress) : undefined,
                opacity: motion.opacity,
                transform: `scale(${motion.scale})`,
                transition: motion.animate ? NODE_TRANSITION : 'none',
                transitionDelay: motion.animate
                    ? `${staggerMs(index)}ms`
                    : '0ms',
            }}
            onClick={() => onSelect(id)}
        >
            {unlocked && done ? '✓' : lessonCount}
        </button>
    );
};
