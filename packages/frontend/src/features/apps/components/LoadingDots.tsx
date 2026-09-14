import { type FC } from 'react';
import classes from './LoadingDots.module.css';

/** Three-dot pulse trailing an in-progress status line. */
const LoadingDots: FC = () => (
    <span className={classes.loadingDots}>
        <span className={classes.loadingDot} />
        <span className={classes.loadingDot} />
        <span className={classes.loadingDot} />
    </span>
);

export default LoadingDots;
