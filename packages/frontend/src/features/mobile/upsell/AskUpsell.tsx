import classes from './MobileUpsell.module.css';
import { Phone, PixelBars } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const AskUpsell = () => (
    <div className={`${classes.scene} ${classes.askScene}`}>
        <Phone className={classes.askPhone}>
            <div className={classes.screenTitle}>{S.ask}</div>
            <div className={classes.bubble}>{S.question}</div>
            <div className={classes.reply}>
                <div className={classes.thinking}>
                    <i />
                    <i />
                    <i />
                </div>
                <div className={classes.answer}>
                    <span>{S.ordersByMonth}</span>
                    <PixelBars />
                </div>
            </div>
        </Phone>
        <div className={classes.liftCard}>
            <span>{S.ordersByMonth}</span>
            <PixelBars />
        </div>
    </div>
);
