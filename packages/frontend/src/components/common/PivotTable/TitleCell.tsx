import { TitleFieldValue } from '@lightdash/common';
import { FC } from 'react';
import { useStyles } from './tableStyles';

type TitleCellProps = {
    title: TitleFieldValue;
    getLabel: (fieldId: string | null | undefined) => string;
};
const TitleCell: FC<TitleCellProps> = ({ title, getLabel }) => {
    const { classes } = useStyles();
    const textAlign = title?.titleDirection === 'header' ? 'right' : 'left';
    const label = getLabel(title?.fieldId);
    // TODO: @irakli - what's the correct place for conditional styling?
    return (
        <th style={{ textAlign }} className={classes.header}>
            {label}
        </th>
    );
};

export default TitleCell;
