import { subject } from '@casl/ability';
import {
    assertUnreachable,
    type RegistryChartTypeListItem,
} from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { IconPhoto } from '@tabler/icons-react';
import { type FC, type ReactNode } from 'react';
import Callout from '../../../components/common/Callout';
import MantineIcon from '../../../components/common/MantineIcon';
import MantineModal from '../../../components/common/MantineModal';
import { useTimeAgo } from '../../../hooks/useTimeAgo';
import { Can } from '../../../providers/Ability';
import useApp from '../../../providers/App/useApp';
import { useInstallRegistryChartType } from '../hooks/useInstallRegistryChartType';
import { registryAssetUrl } from '../utils/registryAssetUrl';
import classes from './ChartTypeLibraryDetailModal.module.css';
import DataAppVizFieldTypeBadge from './DataAppVizFieldTypeBadge';

type Props = {
    projectUuid: string;
    item: RegistryChartTypeListItem;
    onClose: () => void;
};

const ChartTypeLibraryDetailModal: FC<Props> = ({
    projectUuid,
    item,
    onClose,
}) => {
    const { user } = useApp();
    const publishedAgo = useTimeAgo(item.publishedAt);
    const installMutation = useInstallRegistryChartType();

    const handleInstall = () => {
        installMutation.mutate(
            { projectUuid, chartSlug: item.slug },
            { onSuccess: onClose },
        );
    };

    const footerAction: ReactNode = (() => {
        switch (item.state) {
            case 'not_installed':
                return (
                    <Button
                        loading={installMutation.isLoading}
                        onClick={handleInstall}
                    >
                        Install
                    </Button>
                );
            case 'update_available':
                return (
                    <Button
                        loading={installMutation.isLoading}
                        onClick={handleInstall}
                    >
                        Upgrade to v{item.version}
                    </Button>
                );
            case 'installed':
                return (
                    <Button variant="default" onClick={onClose}>
                        View in gallery
                    </Button>
                );
            case 'incompatible':
                return (
                    <Group gap="sm" wrap="nowrap">
                        <Text fz="xs" c="dimmed">
                            Requires Lightdash v{item.minLightdashVersion} or
                            later
                        </Text>
                        <Button disabled>Install</Button>
                    </Group>
                );
            default:
                return assertUnreachable(
                    item.state,
                    `Unknown registry chart type state: ${item.state}`,
                );
        }
    })();

    return (
        <MantineModal
            opened
            onClose={onClose}
            title={item.name}
            subtitle={`v${item.version}`}
            bodyScrollAreaMaxHeight="calc(100vh - 200px)"
            cancelLabel={item.state === 'installed' ? false : 'Cancel'}
            actions={
                <Can
                    I="create"
                    this={subject('DataApp', {
                        organizationUuid: user.data?.organizationUuid,
                        projectUuid,
                    })}
                >
                    {footerAction}
                </Can>
            }
        >
            <Stack gap="md">
                {item.screenshots.length > 0 ? (
                    <ScrollArea type="auto" offsetScrollbars>
                        <Group
                            gap="sm"
                            wrap="nowrap"
                            className={classes.screenshotRow}
                        >
                            {item.screenshots.map((path) => (
                                <img
                                    key={path}
                                    src={registryAssetUrl(path)}
                                    alt={item.name}
                                    className={classes.screenshot}
                                />
                            ))}
                        </Group>
                    </ScrollArea>
                ) : item.thumbnail ? (
                    <Box className={classes.preview}>
                        <img
                            src={registryAssetUrl(item.thumbnail)}
                            alt={item.name}
                            className={classes.previewImage}
                        />
                    </Box>
                ) : (
                    <Box className={classes.preview}>
                        <Stack
                            align="center"
                            justify="center"
                            gap="xs"
                            h="100%"
                        >
                            <MantineIcon
                                icon={IconPhoto}
                                size="xl"
                                color="ldGray.5"
                            />
                        </Stack>
                    </Box>
                )}

                <Text fz="sm" c="ldGray.7" lh={1.55}>
                    {item.description || 'No description'}
                </Text>

                {item.state === 'update_available' && (
                    <Callout
                        variant="warning"
                        title="Upgrading affects every chart of this type"
                    >
                        Upgrading updates every chart in this project that uses
                        this chart type.
                        {item.changelog && (
                            <Text fz="sm" mt="xs">
                                {item.changelog}
                            </Text>
                        )}
                    </Callout>
                )}

                <Box>
                    <Text fz={12} fw={600} c="ldGray.6" mb={4}>
                        Fields
                    </Text>
                    <Group gap="sm">
                        {item.vizSchema.fields.map((field) => (
                            <Group key={field.name} gap={4} wrap="nowrap">
                                <DataAppVizFieldTypeBadge type={field.type} />
                                <Text fz="sm">{field.label}</Text>
                            </Group>
                        ))}
                    </Group>
                </Box>

                <SimpleGrid cols={2} className={classes.metaPanel}>
                    <Box>
                        <Text fz={12} fw={600} c="ldGray.6">
                            Version
                        </Text>
                        <Text fz="sm" fw={500} c="ldGray.8">
                            v{item.version}
                        </Text>
                    </Box>
                    <Box>
                        <Text fz={12} fw={600} c="ldGray.6">
                            Published
                        </Text>
                        <Text fz="sm" fw={500} c="ldGray.8">
                            {publishedAgo}
                        </Text>
                    </Box>
                </SimpleGrid>

                {item.changelog && item.state !== 'update_available' && (
                    <Box>
                        <Text fz={12} fw={600} c="ldGray.6" mb={4}>
                            Changelog
                        </Text>
                        <Text fz="sm" c="ldGray.7">
                            {item.changelog}
                        </Text>
                    </Box>
                )}
            </Stack>
        </MantineModal>
    );
};

export default ChartTypeLibraryDetailModal;
