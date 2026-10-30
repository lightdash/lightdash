import { type OrganizationBrandLogo } from '@lightdash/common';
import { Box, Group, Paper, Stack, Text } from '@mantine/core';
import {
    IconChevronDown,
    IconCirclePlus,
    IconLayoutGrid,
    IconX,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { pickBrandLogo } from '../../../hooks/organization/brandLogos';
import Logo from '../../../svgs/logo-icon.svg?react';
import MantineIcon from '../../common/MantineIcon';
import classes from './ApplicationBrandPreview.module.css';

export const ApplicationBrandPreview: FC<{
    name: string | null;
    logos: OrganizationBrandLogo[];
}> = ({ name, logos }) => {
    const [failedUrl, setFailedUrl] = useState<string | null>(null);
    const logo = pickBrandLogo(logos);
    const renderLogo = () =>
        logo && logo.url !== failedUrl ? (
            <Box
                component="img"
                src={logo.url}
                alt="Brand logo preview"
                onError={() => setFailedUrl(logo.url)}
            />
        ) : (
            <Logo />
        );

    return (
        <Paper className={classes.window} aria-label="Brand identity preview">
            <Box className={classes.chrome}>
                <Group gap="xs" wrap="nowrap" className={classes.tab}>
                    <Box className={classes.favicon}>{renderLogo()}</Box>
                    <Text size="xs" truncate flex={1}>
                        Settings - {name?.trim() || 'Lightdash'}
                    </Text>
                    <MantineIcon icon={IconX} size="sm" color="dimmed" />
                </Group>
            </Box>
            <Box className={classes.nav}>
                <Group className={classes.navContent} wrap="nowrap" gap="xs">
                    <Box className={classes.navLogo}>{renderLogo()}</Box>
                    <Group className={classes.navButtons} gap={0} wrap="nowrap">
                        <Box className={classes.navItem}>
                            <MantineIcon icon={IconCirclePlus} size="sm" />
                            <Text size="xs">New</Text>
                        </Box>
                        <Box className={classes.navItem}>
                            <MantineIcon icon={IconLayoutGrid} size="sm" />
                            <Text size="xs">Browse</Text>
                        </Box>
                    </Group>
                    <Box flex={1} />
                    <Group className={classes.navButtons} gap={0} wrap="nowrap">
                        <Box className={classes.navItem}>
                            <Text size="xs" className={classes.projectLabel}>
                                My project
                            </Text>
                            <MantineIcon icon={IconChevronDown} size="sm" />
                        </Box>
                    </Group>
                </Group>
            </Box>
            <Stack className={classes.content} gap="md">
                <Text size="sm" fw={500}>
                    Welcome to your workspace
                </Text>
                <Box className={classes.placeholderLine} />
                <Group gap="sm" grow>
                    <Box className={classes.placeholderCard} />
                    <Box className={classes.placeholderCard} />
                    <Box className={classes.placeholderCard} />
                </Group>
            </Stack>
        </Paper>
    );
};
