import classes from './MobileUpsell.module.css';

export const UpsellChart = ({ bars = false }: { bars?: boolean }) => (
    <svg viewBox="0 0 300 100" fill="none">
        <path d="M8 88H292" className={classes.axis} />
        {bars ? (
            <g fill="currentColor">
                <rect x="20" y="50" width="30" height="38" rx="3" />
                <rect
                    x="76"
                    y="34"
                    width="30"
                    height="54"
                    rx="3"
                    opacity=".6"
                />
                <rect x="132" y="44" width="30" height="44" rx="3" />
                <rect
                    x="188"
                    y="18"
                    width="30"
                    height="70"
                    rx="3"
                    opacity=".6"
                />
                <rect x="244" y="8" width="30" height="80" rx="3" />
            </g>
        ) : (
            <path
                d="M10 76L58 56L104 65L150 32L196 43L244 18L290 10"
                className={classes.line}
            />
        )}
    </svg>
);
