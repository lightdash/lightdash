import { IconClock, IconPin, type Icon } from '@tabler/icons-react';
import {
    BarChartIcon,
    DashboardIcon,
    LineChartIcon,
} from '../../../components/common/ContentIcons';
import classes from './MobileUpsell.module.css';
import { Phone, PixelPyramid, Spark } from './UpsellParts';
import { UPSELL_GRAPHIC_STRINGS as S } from './upsellStrings';

const Row = ({
    icon: RowIcon,
    name,
    chart = true,
    current = false,
}: {
    icon: Icon;
    name: string;
    chart?: boolean;
    current?: boolean;
}) => (
    <div className={classes.homeRow} data-current={current}>
        <RowIcon />
        <span>{name}</span>
        {chart && <Spark />}
    </div>
);

export const PinnedUpsell = () => (
    <div className={`${classes.scene} ${classes.homeScene}`}>
        <PixelPyramid />
        <Phone className={classes.homePhone}>
            <div className={classes.homeHeader}>
                <IconPin />
                {S.pinned}
            </div>
            <Row icon={DashboardIcon} name={S.dashboard} chart={false} />
            <Row icon={LineChartIcon} name={S.ordersQuestion} current />
            <div className={classes.homeHeader}>
                <IconClock />
                {S.recent}
            </div>
            <Row icon={BarChartIcon} name={S.revenueQuestion} />
            <Row icon={BarChartIcon} name={S.shipping} />
        </Phone>
    </div>
);
