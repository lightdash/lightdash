import classes from './MobileUpsell.module.css';
import { UpsellChart } from './UpsellChart';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const BrowseUpsell = () => (
    <div className={classes.browse}>
        <div className={classes.spaceList}>
            <span className={classes.folder}>
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3" />
                </svg>
                {S.spaces}
            </span>
            <span>{S.saved}</span>
            <span className={classes.selected}>
                {S.orders}
                <svg
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="m7 5 5 5-5 5" />
                </svg>
            </span>
        </div>
        <div className={classes.browseChart}>
            <UpsellChart bars />
        </div>
    </div>
);
