import { ChartKind } from '@lightdash/common';
import { ActionIcon, Group, Paper, Tooltip } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { TitleBreadCrumbs } from '../../../components/Explorer/SavedChartsHeader/TitleBreadcrumbs';
import { EditableText } from '../../../components/VisualizationConfigs/common/EditableText';
import { useUpdateSqlChartMutation } from '../hooks/useSavedSqlCharts';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { DEFAULT_NAME, toggleModal, updateName } from '../store/sqlRunnerSlice';
import { SaveSqlChartModal } from './SaveSqlChartModal';
import ShareSqlLinkButton from './ShareSqlLinkButton';

export const Header: FC = () => {
    const dispatch = useAppDispatch();
    const projectUuid = useAppSelector((state) => state.sqlRunner.projectUuid);
    const savedSqlUuid = useAppSelector(
        (state) => state.sqlRunner.savedSqlUuid,
    );
    const space = useAppSelector((state) => state.sqlRunner.space);
    const name = useAppSelector((state) => state.sqlRunner.name);
    const sql = useAppSelector((state) => state.sqlRunner.sql);
    const config = useAppSelector((state) =>
        state.sqlRunner.selectedChartType === ChartKind.TABLE
            ? state.sqlRunner.tableChartConfig
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
                        <EditableText
                            size="md"
                            w={400}
                            placeholder={DEFAULT_NAME}
                            value={name}
                            onChange={(e) =>
                                dispatch(updateName(e.currentTarget.value))
                            }
                        />
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
                    </Group>
                </Group>
            </Paper>
            <SaveSqlChartModal
                key={`${isSaveModalOpen}-saveChartModal`}
                opened={isSaveModalOpen}
                onClose={onCloseSaveModal}
            />
        </>
    );
};
