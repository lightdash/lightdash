import { memo } from 'react';
import { type ColourTransition } from '../map/colourTransition';
import { getDrawnSquares, type WaffleSquare } from './groupSquares';
import { getSquareOffset, type WaffleGrid } from './layout';
import styles from './Waffle.module.css';

type Props = {
    squares: WaffleSquare[];
    grid: Extract<WaffleGrid, { kind: 'squares' }>;
    // How the squares change colour, which decides whether a person or a place keeps each element
    transition: ColourTransition;
};

// One element per person, moved into its place rather than laid out by the page. Memoised per part, so selecting a
// department redraws no square
export const WaffleSquares = memo<Props>(({ squares, grid, transition }) => (
    <>
        {getDrawnSquares(squares, transition).map(({ key, square }) => {
            const { x, y } = getSquareOffset(grid, square.position);
            // Departs from the frontend rules (Box, no inline style) for speed: up to 20,000 squares that differ only in place
            return (
                <span
                    key={key}
                    className={`${styles.mark} ${styles.square}`}
                    data-kind={square.kind}
                    style={{ transform: `translate(${x}px, ${y}px)` }}
                />
            );
        })}
    </>
));
WaffleSquares.displayName = 'WaffleSquares';
