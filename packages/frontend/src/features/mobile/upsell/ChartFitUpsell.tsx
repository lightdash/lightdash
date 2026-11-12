import classes from './MobileUpsell.module.css';
import { LineChart } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const ChartFitUpsell = () => (
    <div className={`${classes.scene} ${classes.fitScene}`}>
        <div className={classes.morph}>
            <div className={classes.screenTitle}>{S.ordersByMonth}</div>
            <LineChart stretch />
        </div>
    </div>
);
