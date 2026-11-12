import classes from './MobileUpsell.module.css';
import { BarChart, LineChart, Phone, Tile } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const PlatformsUpsell = () => (
    <div className={`${classes.scene} ${classes.pairScene}`}>
        <Phone className={classes.pairBack}>
            <div className={classes.screenTitle}>{S.dashboard}</div>
            <Tile title={S.ordersByMonth}>
                <LineChart />
            </Tile>
            <Tile title={S.revenueByMethod}>
                <BarChart />
            </Tile>
        </Phone>
        <Phone className={classes.pairFront} cutout="dot">
            <div className={classes.screenTitle}>{S.ask}</div>
            <div className={classes.bubble}>{S.question}</div>
            <div className={classes.answer}>
                <span>{S.ordersByMonth}</span>
                <BarChart />
            </div>
        </Phone>
    </div>
);
