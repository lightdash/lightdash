import { FC } from 'react';
import { useStyles } from './UseStyles';

type HeaderCellProps = {
    label: string | undefined;
};
const HeaderCell: FC<HeaderCellProps> = ({ label }) => {
    const { classes } = useStyles();
    return <th className={classes.header}>{label || '-'}</th>;
};

export default HeaderCell;
