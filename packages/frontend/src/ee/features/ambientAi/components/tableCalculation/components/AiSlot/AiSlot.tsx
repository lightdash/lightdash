import { Box } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import MantineIcon from '../../../../../../../components/common/MantineIcon';
import classes from './AiSlot.module.css';

type Props = {
    icon: Icon;
    iconColor: string;
    title: ReactNode;
    rightSlot?: ReactNode;
    children: ReactNode;
};

export const AiSlot: FC<Props> = ({
    icon,
    iconColor,
    title,
    rightSlot,
    children,
}) => (
    <Box className={classes.container}>
        <Box className={classes.header}>
            <Box className={classes.title}>
                <MantineIcon icon={icon} color={iconColor} size="sm" />
                <span>{title}</span>
            </Box>
            {rightSlot && <Box className={classes.actions}>{rightSlot}</Box>}
        </Box>
        <Box className={classes.body}>{children}</Box>
    </Box>
);
