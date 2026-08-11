import { getAppDisplayName, type DataAppViz } from '@lightdash/common';
import { ActionIcon, Box, Menu, Stack, Text } from '@mantine/core';
import {
    IconDots,
    IconFilePencil,
    IconTelescope,
    IconTrash,
} from '@tabler/icons-react';
import { type FC } from 'react';
import { Link } from 'react-router';
import { FloatingActionsPill } from '../../../components/common/FloatingActionsPill';
import MantineIcon from '../../../components/common/MantineIcon';
import { PolymorphicPaperButton } from '../../../components/common/PolymorphicPaperButton';
import { useCanEditDataApp } from '../hooks/useCanEditDataApp';
import classes from './ChartTypeGalleryCard.module.css';
import ChartTypeSamplePreview from './ChartTypeSamplePreview';

type Props = {
    dataAppViz: DataAppViz;
    onClick: () => void;
    onDelete: () => void;
};

const ChartTypeGalleryCard: FC<Props> = ({ dataAppViz, onClick, onDelete }) => {
    const canEdit = useCanEditDataApp(dataAppViz.projectUuid, dataAppViz);
    const displayName = getAppDisplayName(
        dataAppViz.name,
        dataAppViz.dataAppVizUuid,
    );

    return (
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
            <Stack gap="xs" p="md">
                <Text fz="sm" fw={600} truncate="end">
                    {displayName}
                </Text>
                <Text fz={13} c="ldGray.6" lh={1.45} lineClamp={2}>
                    {dataAppViz.description ||
                        'Custom chart type built with the app builder'}
                </Text>
            </Stack>
            <FloatingActionsPill className={classes.menuHost}>
                <Menu
                    withArrow
                    withinPortal
                    shadow="md"
                    position="bottom-end"
                    offset={4}
                    arrowOffset={10}
                >
                    <Menu.Target>
                        <ActionIcon
                            size="sm"
                            variant="subtle"
                            color="gray"
                            aria-label={`Actions for ${displayName}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <MantineIcon icon={IconDots} />
                        </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                        {canEdit && (
                            <Menu.Item
                                component={Link}
                                leftSection={
                                    <MantineIcon icon={IconFilePencil} />
                                }
                                to={`/projects/${dataAppViz.projectUuid}/chart-types/${dataAppViz.dataAppVizUuid}`}
                                onClick={(e) => e.stopPropagation()}
                            >
                                Edit
                            </Menu.Item>
                        )}
                        <Menu.Item
                            component={Link}
                            leftSection={<MantineIcon icon={IconTelescope} />}
                            to={`/projects/${dataAppViz.projectUuid}/tables?dataAppVizUuid=${dataAppViz.dataAppVizUuid}`}
                            onClick={(e) => e.stopPropagation()}
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
    );
};

export default ChartTypeGalleryCard;
