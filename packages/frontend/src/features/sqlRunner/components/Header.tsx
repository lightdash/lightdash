import { ChartKind } from '@lightdash/common';
import { ActionIcon, Group, Paper, Title, Tooltip } from '@mantine/core';
import {
    IconArrowBackUp,
    IconDeviceFloppy,
    IconPencil,
    IconTrash,
} from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import { useHistory } from 'react-router-dom';
import MantineIcon from '../../../components/common/MantineIcon';
import { TitleBreadCrumbs } from '../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import { useUpdateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DEFAULT_NAME, toggleModal, updateName } from '../store/sqlRunnerSlice';
import { DeleteSqlChartModal } from './DeleteSqlChartModal';
import { SaveSqlChartModal } from './SaveSqlChartModal';
import ShareSqlLinkButton from './ShareSqlLinkButton';
import { UpdateSqlChartModal } from './UpdateSqlChartModal';

export const Header: FC = () => {
    const history = useHistory();
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const savedSqlUuid = useAppSelector(
        (state) => state.sqlRunner.savedSqlUuid,
    );
    const space = useAppSelector((state) => state.sqlRunner.space);
    const name = useAppSelector((state) => state.sqlRunner.name);
    const slug = useAppSelector((state) => state.sqlRunner.slug);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const config = useAppSelector((state) =>
        state.sqlRunner.selectedChartType === ChartKind.TABLE
            ? state.tableVisConfig.config
            : state.barChartConfig.config,
    );
    const { mutate } = useUpdateSqlChartMutation(
        projectUuid,
        savedSqlUuid || '',
    );

    const isSaveModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.saveChartModal.isOpen,
    );
    const onCloseSaveModal = useCallback(() => {
        dispatch(toggleModal('saveChartModal'));
    }, [dispatch]);
    const isDeleteModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.deleteChartModal.isOpen,
    );
    const onCloseDeleteModal = useCallback(() => {
        dispatch(toggleModal('deleteChartModal'));
    }, [dispatch]);
    const isUpdateModalOpen = useAppSelector(
        (state) => state.sqlRunner.modals.updateChartModal.isOpen,
    );
    const onCloseUpdateModal = useCallback(() => {
        dispatch(toggleModal('updateChartModal'));
    }, [dispatch]);

    return (
        <>
            <Paper shadow="none" radius={0} px="md" py="xs" withBorder>
                <Group position="apart">
                    <Group spacing="two">
                        {space && (
                            <TitleBreadCrumbs
                                projectUuid={projectUuid}
                                spaceUuid={space.uuid}
                                spaceName={space.name}
                            />
                        )}
                        {savedSqlUuid ? (
                            <>
                                <Title c="dark.6" order={5} fw={600}>
                                    {name}
                                </Title>
                                <ActionIcon
                                    size="xs"
                                    color="gray.6"
                                    onClick={() =>
                                        dispatch(
                                            toggleModal('updateChartModal'),
                                        )
                                    }
                                >
                                    <MantineIcon icon={IconPencil} />
                                </ActionIcon>
                            </>
                        ) : (
                            <EditableText
                                size="md"
                                w={400}
                                placeholder={DEFAULT_NAME}
                                value={name}
                                onChange={(e) =>
                                    dispatch(updateName(e.currentTarget.value))
                                }
                            />
                        )}
                    </Group>
                    <Group spacing="md">
                        <Tooltip
                            variant="xs"
                            label="Save chart"
                            position="bottom"
                        >
                            <ActionIcon size="xs">
                                <MantineIcon
                                    icon={IconDeviceFloppy}
                                    onClick={() => {
                                        if (savedSqlUuid) {
                                            if (config && sql) {
                                                mutate({
                                                    versionedData: {
                                                        config,
                                                        sql,
                                                    },
                                                });
                                            }
                                        } else {
                                            dispatch(
                                                toggleModal('saveChartModal'),
                                            );
                                        }
                                    }}
                                />
                            </ActionIcon>
                        </Tooltip>
                        <Tooltip
                            variant="xs"
                            label="Share URL"
                            position="bottom"
                        >
                            <ShareSqlLinkButton />
                        </Tooltip>
                        {slug && (
                            <Tooltip
                                variant="xs"
                                label="Back to view page"
                                position="bottom"
                            >
                                <ActionIcon size="xs">
                                    <MantineIcon
                                        icon={IconArrowBackUp}
                                        onClick={() =>
                                            history.push(
                                                `/projects/${projectUuid}/sql-runner-new/saved/${slug}`,
                                            )
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                        {savedSqlUuid && (
                            <Tooltip
                                variant="xs"
                                label="Delete"
                                position="bottom"
                            >
                                <ActionIcon size="xs">
                                    <MantineIcon
                                        icon={IconTrash}
                                        onClick={() =>
                                            dispatch(
                                                toggleModal('deleteChartModal'),
                                            )
                                        }
                                    />
                                </ActionIcon>
                            </Tooltip>
                        )}
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />
            {savedSqlUuid && (
                <UpdateSqlChartModal
                    opened={isUpdateModalOpen}
                    projectUuid={projectUuid}
                    savedSqlUuid={savedSqlUuid}
                    onClose={() => onCloseUpdateModal()}
                    onSuccess={() => onCloseUpdateModal()}
                />
            )}
            {savedSqlUuid && (
                <DeleteSqlChartModal
                    projectUuid={projectUuid}
                    savedSqlUuid={savedSqlUuid}
                    name={name}
                    opened={isDeleteModalOpen}
                    onClose={onCloseDeleteModal}
                    onSuccess={() =>
                        history.push(`/projects/${projectUuid}/home`)
                    }
                />
            )}
        </>
    );
};
