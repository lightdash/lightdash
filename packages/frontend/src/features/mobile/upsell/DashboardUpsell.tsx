import classes from './MobileUpsell.module.css';
import { BarChart, LineChart, Phone, Tile, Window } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

const Tiles = ({ className }: { className: string }) => (
    <div className={className}>
        <Tile title={S.ordersByMonth}>
            <LineChart />
        </Tile>
        <Tile title={S.revenueByMethod}>
            <BarChart />
        </Tile>
        <Tile title={S.usersByMonth} className={classes.wideTile}>
            <BarChart />
        </Tile>
    </div>
);

export const DashboardUpsell = () => (
    <div className={`${classes.scene} ${classes.dashScene}`}>
        <Window className={classes.dashWindow}>
            <div className={classes.screenTitle}>{S.dashboard}</div>
            <Tiles className={classes.dashGrid} />
        </Window>
        <Phone className={classes.dashPhone}>
            <div className={classes.screenTitle}>{S.dashboard}</div>
            <div className={classes.dashViewport}>
                <Tiles className={classes.dashColumn} />
            </div>
        </Phone>
    </div>
);
