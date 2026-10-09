import { memo } from 'react';
import { type WaffleSquare } from './groupSquares';
import { getSquareOffset, type WaffleGrid } from './layout';
import styles from './Waffle.module.css';

type Props = {
    squares: WaffleSquare[];
    grid: Extract<WaffleGrid, { kind: 'squares' }>;
};

// One plain element per person, as there can be thousands, each moved into its place rather than laid out by the
// page. Memoised per part, so selecting a department redraws no square
export const WaffleSquares = memo<Props>(({ squares, grid }) => {
    // Each place keeps its element, so a change of colouring changes only what the places show
    const byPlace = [...squares].sort((a, b) => a.position - b.position);
    return (
        <>
            {byPlace.map((square) => {
                const { x, y } = getSquareOffset(grid, square.position);
                return (
                    <div
                        key={square.position}
                        className={`${styles.mark} ${styles.square}`}
                        data-kind={square.kind}
                        style={{ transform: `translate(${x}px, ${y}px)` }}
                    />
                );
            })}
        </>
    );
});
WaffleSquares.displayName = 'WaffleSquares';
