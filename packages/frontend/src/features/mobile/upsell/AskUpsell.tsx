import classes from './MobileUpsell.module.css';
import { UpsellChart } from './UpsellChart';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const AskUpsell = () => (
    <div className={classes.ask}>
        <div className={classes.question}>{S.question}</div>
        <div className={classes.answer}>
            <UpsellChart />
        </div>
    </div>
);
