import { Center, Text } from '@mantine-8/core';
import { IconTool } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../common/MantineIcon';
import { BANNER_HEIGHT } from '../common/Page/constants';
import classes from './PreviewBanner.module.css';

const formatExpirationSuffix = (expiresAt: Date): string => {
    const expiresAtDate = new Date(expiresAt);
    const diffMs = expiresAtDate.getTime() - Date.now();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const formatted = expiresAtDate.toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    });
    if (diffDays <= 0) return ` Expires today (${formatted}).`;
    if (diffDays === 1) return ` Expires in 1 day (${formatted}).`;
    return ` Expires in ${diffDays} days (${formatted}).`;
};

export const PreviewBanner: FC<{ expiresAt: Date | null }> = ({
    expiresAt,
}) => (
    <Center
        id="preview-banner"
        pos="fixed"
        top={0}
        w="100%"
        h={BANNER_HEIGHT}
        bg="blue.6"
        className={classes.banner}
    >
        <MantineIcon icon={IconTool} color="white" size="sm" />
        <Text c="white" fw={500} fz="xs" mx={4}>
            This is a preview environment. Any changes you make here will not
            affect production.
            {expiresAt && formatExpirationSuffix(expiresAt)}
        </Text>
    </Center>
);
