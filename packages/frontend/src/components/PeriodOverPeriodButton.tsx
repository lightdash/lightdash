import { type ItemsMap } from '@lightdash/common';
import { memo, type FC } from 'react';

type Props = {
    itemsMap: ItemsMap | undefined;
    disabled: boolean;
};

const PeriodOverPeriodButton: FC<Props> = memo((_props) => {
    // No-op
    return null;
});

export default PeriodOverPeriodButton;
