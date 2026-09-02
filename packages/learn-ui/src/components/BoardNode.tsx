import { type FC } from 'react';
import { askOpacity, askScale, type NodeAskState } from '../model/askView';
import { NODE_SIZE } from '../model/layout';
import { plural } from '../model/model';
import { NODE_TRANSITION, staggerMs, type NodeMotion } from '../model/motion';
import { progressFill } from '../model/tokens';
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
    askState: NodeAskState;
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
    askState,
    onSelect,
}) => {
    const showPulse = nextUp && unlocked && !selected && askState === 'none';
    // Ring/glow/label colour are enumerable states, so they live as CSS
    // modifier classes; only continuous per-node values stay inline.
    const className = [
        styles.node,
        !unlocked && styles.nodeLocked,
        unlocked && done && styles.nodeDone,
        selected && styles.nodeSelected,
        showPulse && styles.nodeNextUp,
        askState === 'matched' && styles.nodeMatched,
        askState === 'locked-match' && styles.nodeLockedMatch,
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
                opacity: askOpacity(askState, motion.opacity),
                transform: `scale(${askScale(askState, motion.scale)})`,
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
