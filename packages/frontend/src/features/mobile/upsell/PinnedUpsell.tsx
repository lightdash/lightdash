import classes from './MobileUpsell.module.css';
import { UpsellChart } from './UpsellChart';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const PinnedUpsell = () => (
    <div className={classes.pinned}>
        <div className={classes.pinLabel}>
            <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
            >
                <path d="m8 3 8 0-1 7 4 4H5l4-4zM12 14v7" />
            </svg>
            {S.pinned}
        </div>
        <div className={classes.pinChart}>
            <span>{S.orders}</span>
            <UpsellChart />
        </div>
        <div className={classes.recent}>
            <span>{S.recent}</span>
            <i />
            <i />
            <i />
        </div>
    </div>
);
