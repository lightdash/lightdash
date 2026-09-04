import {
    assertUnreachable,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import { Badge, Box, Group, Paper, Stack, Text } from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../components/common/PolymorphicPaperButton';
import { registryAssetUrl } from '../utils/registryAssetUrl';
import ChartTypeBetaBadge from './ChartTypeBetaBadge';
import classes from './ChartTypeLibraryCard.module.css';
import OfficialChartTypeBadge from './OfficialChartTypeBadge';

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
};

const ChartTypeLibraryCard: FC<Props> = ({ item, onClick }) => (
    <PolymorphicPaperButton
        component="button"
        type="button"
        withBorder
        radius="md"
        shadow="subtle"
        className={classes.card}
        onClick={onClick}
    >
        <Box className={classes.preview}>
            {item.thumbnail ? (
                <img
                    src={registryAssetUrl(item.thumbnail)}
                    alt={item.name}
                    className={classes.previewImage}
                />
            ) : (
                <Paper variant="dotted" h="100%" radius={0}>
                    <Stack align="center" justify="center" gap="xs" h="100%">
                        <MantineIcon
                            icon={IconPhoto}
                            size="xl"
                            color="ldGray.5"
                        />
                    </Stack>
                </Paper>
            )}
        </Box>
        <Stack gap="xs" p="sm">
            <Group gap="xs" wrap="nowrap" justify="space-between">
                <Text fz={13} fw={600} truncate="end">
                    {item.name}
                </Text>
                <Group gap={4} wrap="nowrap" className="ld-shrink-0">
                    {item.channel === 'beta' && <ChartTypeBetaBadge />}
                    <OfficialChartTypeBadge />
                </Group>
            </Group>
            <Text fz="xs" c="dimmed" lh={1.35} lineClamp={2}>
                {item.description || 'No description'}
            </Text>
            <StateBadge item={item} />
        </Stack>
    </PolymorphicPaperButton>
);

export default ChartTypeLibraryCard;
