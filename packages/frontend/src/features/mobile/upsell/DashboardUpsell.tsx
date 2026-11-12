import classes from './MobileUpsell.module.css';
import { UpsellChart } from './UpsellChart';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const DashboardUpsell = () => (
    <div className={classes.dashboard}>
        <div className={classes.dashboardWords}>
            <span>{S.overview}</span>
            <span className={classes.tileDots}>
                <i />
                <i />
            </span>
        </div>
        <div className={classes.phone}>
            <div className={classes.speaker} />
            <div className={classes.viewport}>
                <div className={classes.swipe}>
                    <div>
                        <span>{S.orders}</span>
                        <UpsellChart />
                    </div>
                    <div>
                        <span>{S.overview}</span>
                        <UpsellChart bars />
                    </div>
                </div>
            </div>
        </div>
    </div>
);
