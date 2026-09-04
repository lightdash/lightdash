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
import ChartTypeBetaBadge from './ChartTypeBetaBadge';
import classes from './ChartTypeLibraryDetailModal.module.css';
import DataAppVizFieldsList from './DataAppVizFieldsList';

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

    // Only the mutating actions (Install / Upgrade) need the create
    // permission — the informational states below (view-in-gallery,
    // incompatible explanation) render for every viewer.
    const canInstallGate = (button: ReactNode) => (
        <Can
            I="create"
            this={subject('DataApp', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            })}
        >
            {button}
        </Can>
    );

    const footerProps = (() => {
        switch (item.state) {
            case 'not_installed':
                return {
                    actions: canInstallGate(
                        <Button
                            loading={installMutation.isLoading}
                            onClick={handleInstall}
                        >
                            Install
                        </Button>,
                    ),
                };
            case 'installed':
            case 'update_available':
                // Unreachable from the library — installed chart types
                // (upgradable ones included) are hidden here and managed
                // from the installed tab. Handled for type completeness.
                return {
                    actions: (
                        <Button variant="default" onClick={onClose}>
                            Close
                        </Button>
                    ),
                    cancelLabel: false as const,
                };
            case 'incompatible':
                return {
                    actions: (
                        <Group gap="sm" wrap="nowrap">
                            <Text fz="xs" c="dimmed">
                                Requires Lightdash v{item.minLightdashVersion}{' '}
                                or later
                            </Text>
                            <Button disabled>Install</Button>
                        </Group>
                    ),
                };
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
            {...footerProps}
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
                        title="Existing charts keep their pinned version"
                    >
                        Charts pinned to an earlier version keep rendering it
                        until each chart is upgraded; charts without a pinned
                        version switch to v{item.version} right away.
                        {item.changelog && (
                            <Text fz="sm" mt="xs">
                                {item.changelog}
                            </Text>
                        )}
                    </Callout>
                )}

                <DataAppVizFieldsList fields={item.vizSchema.fields} />

                <SimpleGrid cols={2} className={classes.metaPanel}>
                    <Box>
                        <Text fz={12} fw={600} c="ldGray.6">
                            Version
                        </Text>
                        <Group gap="xs" wrap="nowrap">
                            <Text fz="sm" fw={500} c="ldGray.8">
                                v{item.version}
                            </Text>
                            {item.channel === 'beta' && <ChartTypeBetaBadge />}
                        </Group>
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
