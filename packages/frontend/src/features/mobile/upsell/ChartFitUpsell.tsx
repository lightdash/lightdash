import classes from './MobileUpsell.module.css';
import { LineChart, Phone } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const ChartFitUpsell = () => (
    <div className={`${classes.scene} ${classes.fitScene}`}>
        <i className={classes.corner} />
        <i className={classes.corner} />
        <i className={classes.corner} />
        <i className={classes.corner} />
        <Phone className={classes.morph}>
            <div className={classes.screenTitle}>{S.ordersByMonth}</div>
            <LineChart stretch />
        </Phone>
    </div>
);
