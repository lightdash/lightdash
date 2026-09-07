import {
    getAppDisplayName,
    isOfficialChartType,
    type DataAppViz,
} from '@lightdash/common';
import {
    ActionIcon,
    Badge,
    Box,
    Group,
    Menu,
    Stack,
    Text,
    Tooltip,
} from '@mantine/core';
import {
    IconDots,
    IconFilePencil,
    IconGitFork,
    IconTelescope,
    IconTrash,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import { Link } from 'react-router';
import { FloatingActionsPill } from '../../../components/common/FloatingActionsPill';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../components/common/PolymorphicPaperButton';
import { useCanCreateDataApp } from '../../apps/hooks/useCanCreateDataApp';
import { useCanEditDataApp } from '../../apps/hooks/useCanEditDataApp';
import { chartTypeBuilderPath } from '../utils/chartTypeBuilderPath';
import ChartTypeForkModal from './ChartTypeForkModal';
import classes from './ChartTypeGalleryCard.module.css';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';
import OfficialChartTypeBadge from './OfficialChartTypeBadge';

type Props = {
    dataAppViz: DataAppViz;
    /** A newer registry version of this official chart type exists */
    hasRegistryUpdate: boolean;
    onClick: () => void;
    onPreview: () => void;
    onDelete: () => void;
};

const ChartTypeGalleryCard: FC<Props> = ({
    dataAppViz,
    hasRegistryUpdate,
    onClick,
    onPreview,
    onDelete,
}) => {
    const canEdit = useCanEditDataApp(dataAppViz.projectUuid, dataAppViz);
    const canFork = useCanCreateDataApp(dataAppViz.projectUuid);
    const isOfficial = isOfficialChartType(dataAppViz);
    const [isForkOpen, setIsForkOpen] = useState(false);
    const displayName = getAppDisplayName(
        dataAppViz.name,
        dataAppViz.dataAppVizUuid,
    );

    return (
        <>
            <PolymorphicPaperButton
                component="div"
                withBorder
                radius="md"
                shadow="subtle"
                className={classes.card}
                onClick={onClick}
            >
                <Box className={classes.preview}>
                    <ChartTypeSamplePreview
                        projectUuid={dataAppViz.projectUuid}
                        dataAppVizUuid={dataAppViz.dataAppVizUuid}
                    />
                </Box>
                <Stack gap="xs" p="sm">
                    <Group gap="xs" wrap="nowrap" justify="space-between">
                        <Text fz="sm" fw={600} truncate="end">
                            {displayName}
                        </Text>
                        {isOfficial && <OfficialChartTypeBadge />}
                    </Group>
                    <Text fz="xs" c="dimmed" lh={1.35} lineClamp={2}>
                        {dataAppViz.description || 'No description'}
                    </Text>
                    {hasRegistryUpdate && (
                        <Badge size="xs" variant="light" color="orange">
                            Update available
                        </Badge>
                    )}
                </Stack>
                <FloatingActionsPill className={classes.menuHost}>
                    {isOfficial
                        ? canFork && (
                              <Tooltip label="Fork to customize">
                                  <ActionIcon
                                      size="sm"
                                      aria-label={`Fork ${displayName}`}
                                      onClick={(e) => {
                                          e.stopPropagation();
                                          setIsForkOpen(true);
                                      }}
                                  >
                                      <MantineIcon icon={IconGitFork} />
                                  </ActionIcon>
                              </Tooltip>
                          )
                        : canEdit && (
                              <Tooltip label="Edit">
                                  <ActionIcon
                                      size="sm"
                                      component={Link}
                                      to={chartTypeBuilderPath(
                                          dataAppViz.projectUuid,
                                          dataAppViz.dataAppVizUuid,
                                      )}
                                      aria-label={`Edit ${displayName}`}
                                      onClick={(e) => e.stopPropagation()}
                                  >
                                      <MantineIcon icon={IconFilePencil} />
                                  </ActionIcon>
                              </Tooltip>
                          )}
                    <Menu
                        withArrow
                        position="bottom-end"
                        offset={4}
                        arrowOffset={10}
                    >
                        <Menu.Target>
                            <ActionIcon
                                size="sm"
                                aria-label={`Actions for ${displayName}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                <MantineIcon icon={IconDots} />
                            </ActionIcon>
                        </Menu.Target>
                        <Menu.Dropdown>
                            <Menu.Item
                                leftSection={
                                    <MantineIcon icon={IconTelescope} />
                                }
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onPreview();
                                }}
                            >
                                Preview in explorer
                            </Menu.Item>
                            {canEdit && (
                                <>
                                    <Menu.Divider />
                                    <Menu.Item
                                        color="red"
                                        leftSection={
                                            <MantineIcon icon={IconTrash} />
                                        }
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete();
                                        }}
                                    >
                                        Delete
                                    </Menu.Item>
                                </>
                            )}
                        </Menu.Dropdown>
                    </Menu>
                </FloatingActionsPill>
            </PolymorphicPaperButton>
            {isForkOpen && (
                <ChartTypeForkModal
                    opened
                    onClose={() => setIsForkOpen(false)}
                    projectUuid={dataAppViz.projectUuid}
                    appUuid={dataAppViz.dataAppVizUuid}
                    defaultName={`${dataAppViz.name} (custom)`}
                />
            )}
        </>
    );
};

export default ChartTypeGalleryCard;
