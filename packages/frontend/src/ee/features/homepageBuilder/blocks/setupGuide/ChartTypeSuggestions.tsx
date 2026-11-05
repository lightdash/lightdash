import { type RegistryChartTypeListItem } from '@lightdash/common';
import { Anchor, Box, Button, Group, Stack, Text } from '@mantine/core';
import { IconChartDots3 } from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import MantineIcon from '../../../../../components/common/MantineIcon';
import { useCanCreateDataApp } from '../../../../../features/apps/hooks/useCanCreateDataApp';
import RegistryAssetImage from '../../../../../features/chartTypes/components/RegistryAssetImage';
import { useInstallRegistryChartType } from '../../../../../features/chartTypes/hooks/useInstallRegistryChartType';
import { registryThumbnailPath } from '../../../../../features/chartTypes/utils/registryAssetUrl';
import { useAppColorScheme } from '../../../../../providers/ColorSchemeContext';
import classes from './SetupGuide.module.css';

export const ChartTypeSuggestions: FC<{
    projectUuid: string;
    chartTypes: RegistryChartTypeListItem[];
    libraryUrl: string;
}> = ({ projectUuid, chartTypes, libraryUrl }) => {
    const { colorScheme } = useAppColorScheme();
    const canInstall = useCanCreateDataApp(projectUuid);
    const install = useInstallRegistryChartType();
    const placeholder = (
        <Box className={classes.chartTypeThumb}>
            <MantineIcon icon={IconChartDots3} color="dimmed" />
        </Box>
    );
    return (
        <Box p="sm">
            <Text fz="sm" fw={600}>
                Try a new chart type
            </Text>
            <Text fz="xs" c="dimmed" mb="sm">
                Install one from the library and use it in any chart.
            </Text>
            <Stack gap="xs">
                {chartTypes.map((item) => {
                    const thumbnail = registryThumbnailPath(item, colorScheme);
                    return (
                        <Group key={item.slug} gap="sm" wrap="nowrap">
                            {thumbnail ? (
                                <RegistryAssetImage
                                    path={thumbnail}
                                    alt={item.name}
                                    className={classes.chartTypeThumb}
                                    fallback={placeholder}
                                />
                            ) : (
                                placeholder
                            )}
                            <Text
                                fz="xs"
                                fw={500}
                                truncate
                                className={classes.grow}
                            >
                                {item.name}
                            </Text>
                            {canInstall && (
                                <Button
                                    size="compact-xs"
                                    variant="default"
                                    loading={
                                        install.isLoading &&
                                        install.variables?.chartSlug ===
                                            item.slug
                                    }
                                    disabled={install.isLoading}
                                    aria-label={`Install ${item.name}`}
                                    onClick={() =>
                                        install.mutate({
                                            projectUuid,
                                            chartSlug: item.slug,
                                        })
                                    }
                                >
                                    Install
                                </Button>
                            )}
                        </Group>
                    );
                })}
            </Stack>
            <Anchor
                component={Link}
                to={libraryUrl}
                fz="xs"
                mt="sm"
                display="block"
            >
                Browse the library
            </Anchor>
        </Box>
    );
};
