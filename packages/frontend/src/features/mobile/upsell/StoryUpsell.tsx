import classes from './MobileUpsell.module.css';
import { UpsellChart } from './UpsellChart';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

export const StoryUpsell = () => (
    <div className={classes.story}>
        <div className={classes.storyAsk}>
            <svg
                viewBox="0 0 64 76"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <path d="M10 14h44v34H28L16 58V48h-6zM20 26h24M20 34h16" />
            </svg>
            <span>{S.ask}</span>
        </div>
        <div className={classes.storySee}>
            <UpsellChart bars />
            <span>{S.answer}</span>
        </div>
        <div className={classes.storyTake}>
            <svg
                viewBox="0 0 64 76"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
            >
                <rect x="16" y="6" width="32" height="60" rx="7" />
                <path d="M27 12h10M24 42l6-6 5 3 6-12M27 59h10" />
            </svg>
            <span>{S.take}</span>
        </div>
    </div>
);
