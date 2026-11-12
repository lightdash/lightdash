import {
    IconChartBar,
    IconChartLine,
    IconChevronRight,
    IconFolder,
} from '@tabler/icons-react';
import classes from './MobileUpsell.module.css';
import { BarChart } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const BrowseUpsell = () => (
    <div className={`${classes.scene} ${classes.browseScene}`}>
        <div className={`${classes.sheet} ${classes.spacesSheet}`}>
            <div className={classes.screenTitle}>{S.browse}</div>
            <small>{S.spaces}</small>
            <div className={`${classes.row} ${classes.picked}`}>
                <IconFolder />
                <span>{S.space}</span>
                <IconChevronRight />
            </div>
        </div>
        <div className={`${classes.sheet} ${classes.chartsSheet}`}>
            <div className={classes.screenTitle}>{S.space}</div>
            <div className={`${classes.row} ${classes.picked}`}>
                <IconChartBar />
                <span>{S.revenueQuestion}</span>
            </div>
            <div className={classes.row}>
                <IconChartLine />
                <span>{S.ordersQuestion}</span>
            </div>
            <div className={classes.row}>
                <IconChartBar />
                <span>{S.shipping}</span>
            </div>
        </div>
        <div className={`${classes.sheet} ${classes.chartSheet}`}>
            <div className={classes.screenTitle}>{S.revenueQuestion}</div>
            <BarChart />
        </div>
    </div>
);
