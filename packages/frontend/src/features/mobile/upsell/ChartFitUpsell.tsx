import classes from './MobileUpsell.module.css';
import { UpsellChart } from './UpsellChart';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const ChartFitUpsell = () => (
    <div className={classes.compare}>
        <div className={classes.desk}>
            <div className={classes.desktopChart}>
                <span>{S.orders}</span>
                <UpsellChart />
            </div>
            <span>{S.desktop}</span>
        </div>
        <svg
            className={classes.fitArrow}
            viewBox="0 0 32 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
        >
            <path d="M3 12h25m-7-7 7 7-7 7" />
        </svg>
        <div className={classes.hand}>
            <div className={classes.phone}>
                <div className={classes.speaker} />
                <span>{S.orders}</span>
                <UpsellChart />
            </div>
            <span>{S.phone}</span>
        </div>
    </div>
);
