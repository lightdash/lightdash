import { Box } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './blockStyles.module.css';

export const MiniPill: FC<PropsWithChildren> = ({ children }) => (
    <span className={classes.miniPill}>{children}</span>
);

type BlockHeaderProps = {
    icon: Icon;
    iconColor?: string;
    title: ReactNode;
    pill?: string;
    mb?: number;
    /** Centre the header — used when the block's content is centred too, so
     * header and content read as one unit. */
    centered?: boolean;
};

export const BlockHeader: FC<PropsWithChildren<BlockHeaderProps>> = ({
    icon,
    iconColor,
    title,
    pill,
    mb = 10,
    centered = false,
    children,
}) => (
    <Box
        className={`${classes.sectionHeader}${
            centered ? ` ${classes.sectionHeaderCentered}` : ''
        }`}
        mb={mb}
    >
        <MantineIcon icon={icon} size={14} color={iconColor ?? 'ldGray.6'} />
        {typeof title === 'string' ? (
            <span className={classes.sectionTitle}>{title}</span>
        ) : (
            title
        )}
        {pill ? <MiniPill>{pill}</MiniPill> : null}
        {children}
    </Box>
);

export const IconSquare: FC<{
    icon: Icon;
    size?: 'md' | 'lg';
}> = ({ icon, size = 'md' }) => (
    <div
        className={
            size === 'lg'
                ? `${classes.iconSquare} ${classes.iconSquareLg}`
                : classes.iconSquare
        }
    >
        <MantineIcon icon={icon} size={size === 'lg' ? 18 : 16} />
    </div>
);
