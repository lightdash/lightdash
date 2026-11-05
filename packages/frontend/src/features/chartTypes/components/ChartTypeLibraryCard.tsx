import {
    assertUnreachable,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import {
    Badge,
    Box,
    Button,
    Group,
    Paper,
    Stack,
    Text,
    UnstyledButton,
} from '@mantine/core';
import { IconDownload, IconPhoto } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { useAppColorScheme } from '../../../providers/ColorSchemeContext';
import { registryThumbnailPath } from '../utils/registryAssetUrl';
import classes from './ChartTypeLibraryCard.module.css';
import OfficialChartTypeBadge from './OfficialChartTypeBadge';
import RegistryAssetImage from './RegistryAssetImage';

const StateBadge: FC<{ item: RegistryChartTypeListItem }> = ({ item }) => {
    switch (item.state) {
        case 'not_installed':
            return null;
        case 'installed':
            return (
                <Badge size="xs" variant="light" color="green">
                    Installed v{item.installedRegistryVersion}
                </Badge>
            );
        case 'update_available':
            return (
                <Badge size="xs" variant="light" color="orange">
                    Update available
                </Badge>
            );
        case 'incompatible':
            return (
                <Badge size="xs" variant="light" color="gray">
                    Requires newer Lightdash
                </Badge>
            );
        default:
            return assertUnreachable(
                item.state,
                `Unknown registry chart type state: ${item.state}`,
            );
    }
};

type Props = {
    item: RegistryChartTypeListItem;
    onClick: () => void;
    /** Installs straight from the card; null when it can't be installed here. */
    onInstall: (() => void) | null;
    isInstalling: boolean;
};

const ChartTypeLibraryCard: FC<Props> = ({
    item,
    onClick,
    onInstall,
    isInstalling,
}) => {
    const { colorScheme } = useAppColorScheme();
    const thumbnail = registryThumbnailPath(item, colorScheme);
    const placeholder = (
        <Paper variant="dotted" h="100%" radius={0}>
            <Stack align="center" justify="center" gap="xs" h="100%">
                <MantineIcon icon={IconPhoto} size="xl" color="ldGray.5" />
            </Stack>
        </Paper>
    );
    return (
        <Paper withBorder radius="lg" className={classes.card}>
            <Box className={classes.preview}>
                {thumbnail ? (
                    <RegistryAssetImage
                        path={thumbnail}
                        alt={item.name}
                        className={classes.previewImage}
                        fallback={placeholder}
                    />
                ) : (
                    placeholder
                )}
            </Box>
            <Stack gap="xs" px="xs" pt="sm" pb="xs">
                <Group gap="xs" wrap="nowrap" justify="space-between">
                    <UnstyledButton
                        className={classes.hit}
                        onClick={onClick}
                        miw={0}
                    >
                        <Text fz="sm" fw={500} truncate="end">
                            {item.name}
                        </Text>
                    </UnstyledButton>
                    <Group gap={4} wrap="nowrap" flex="0 0 auto">
                        <OfficialChartTypeBadge />
                    </Group>
                </Group>
                <Text fz="xs" c="dimmed" lh={1.35} lineClamp={1}>
                    {item.description || 'No description'}
                </Text>
                <StateBadge item={item} />
            </Stack>
            {onInstall && (
                <Button
                    size="xs"
                    color="dark"
                    leftSection={<MantineIcon icon={IconDownload} />}
                    className={classes.install}
                    loading={isInstalling}
                    aria-label={`Install ${item.name}`}
                    onClick={onInstall}
                >
                    Install
                </Button>
            )}
        </Paper>
    );
};

export default ChartTypeLibraryCard;
