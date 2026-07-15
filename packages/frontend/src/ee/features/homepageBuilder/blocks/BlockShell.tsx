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
};

export const BlockHeader: FC<PropsWithChildren<BlockHeaderProps>> = ({
    icon,
    iconColor,
    title,
    pill,
    mb = 12,
    children,
}) => (
    <Box className={classes.sectionHeader} mb={mb}>
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

export type IconTint =
    | 'gray'
    | 'dimension'
    | 'metric'
    | 'calculation'
    | 'violet';

const TINT_CLASSES: Record<IconTint, string | undefined> = {
    gray: undefined,
    dimension: classes.tintDimension,
    metric: classes.tintMetric,
    calculation: classes.tintCalculation,
    violet: classes.tintViolet,
};

export const IconSquare: FC<{
    icon: Icon;
    tint?: IconTint;
    size?: 'md' | 'lg';
}> = ({ icon, tint = 'gray', size = 'md' }) => (
    <div
        className={[
            classes.iconSquare,
            size === 'lg' ? classes.iconSquareLg : undefined,
            TINT_CLASSES[tint],
        ]
            .filter(Boolean)
            .join(' ')}
    >
        <MantineIcon icon={icon} size={size === 'lg' ? 18 : 16} />
    </div>
);
