import { Box } from '@mantine-8/core';
import { type Icon } from '@tabler/icons-react';
import { type FC, type PropsWithChildren } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import classes from './blockStyles.module.css';

export const MiniPill: FC<PropsWithChildren> = ({ children }) => (
    <span className={classes.miniPill}>{children}</span>
);

type BlockHeaderProps = {
    icon: Icon;
    title: string;
    pill?: string;
    /** Centre the header — used when the block's content is centred too, so
     * header and content read as one unit. */
    centered?: boolean;
};

export const BlockHeader: FC<BlockHeaderProps> = ({
    icon,
    title,
    pill,
    centered = false,
}) => (
    <Box
        className={`${classes.sectionHeader}${
            centered ? ` ${classes.sectionHeaderCentered}` : ''
        }`}
        mb={10}
    >
        <MantineIcon icon={icon} size={14} color="ldGray.6" />
        <span className={classes.sectionTitle}>{title}</span>
        {pill ? <MiniPill>{pill}</MiniPill> : null}
    </Box>
);

export const IconSquare: FC<{ icon: Icon }> = ({ icon }) => (
    <div className={classes.iconSquare}>
        <MantineIcon icon={icon} size={16} />
    </div>
);
