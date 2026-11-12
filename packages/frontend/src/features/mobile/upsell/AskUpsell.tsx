import classes from './MobileUpsell.module.css';

export const AskUpsell = () => (
    <div className={classes.ask}>
        <div className={classes.question}>Which way are orders moving?</div>
        <div className={classes.answer}>
            <svg viewBox="0 0 300 78" fill="none">
                <path d="M8 66H292" className={classes.axis} />
                <path
                    d="M10 56L58 46L104 52L150 28L196 35L244 16L290 10"
                    className={classes.line}
                />
                <circle cx="290" cy="10" r="4" fill="currentColor" />
            </svg>
        </div>
    </div>
);
