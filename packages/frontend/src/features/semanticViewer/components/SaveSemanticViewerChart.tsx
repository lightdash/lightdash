import { Button, Input, useMantineTheme } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { useCallback, type FC } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { selectCompleteConfigByKind } from '../../../components/DataViz/store/selectors';
import useToaster from '../../../hooks/toaster/useToaster';
import { useAppDispatch, useAppSelector } from '../../sqlRunner/store/hooks';
import {
    useSavedSemanticViewerChart,
    useSavedSemanticViewerChartUpdateMutation,
} from '../api/hooks';
import {
    selectAllSelectedFieldNames,
    selectSemanticLayerInfo,
    selectSemanticLayerQuery,
} from '../store/selectors';
import { updateName, updateSaveModalOpen } from '../store/semanticViewerSlice';

const SaveSemanticViewerChart: FC = () => {
    const theme = useMantineTheme();
    const { showToastSuccess } = useToaster();

    const dispatch = useAppDispatch();

    const name = useAppSelector((state) => state.semanticViewer.name);
    const { projectUuid } = useAppSelector(selectSemanticLayerInfo);
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);
    const semanticLayerView = useAppSelector(
        (state) => state.semanticViewer.semanticLayerView,
    );
    const savedSemanticViewerChartUuid = useAppSelector(
        (state) => state.semanticViewer.savedSemanticViewerChartUuid,
    );
    const selectedFieldNames = useAppSelector(selectAllSelectedFieldNames);
    const activeChartKind = useAppSelector(
        (state) => state.semanticViewer.activeChartKind,
    );
    const selectedChartConfig = useAppSelector((state) =>
        selectCompleteConfigByKind(state, activeChartKind),
    );

    const handleOpenSaveModal = () => {
        dispatch(updateSaveModalOpen(true));
    };

    const savedChartQuery = useSavedSemanticViewerChart({
        projectUuid,
        findBy: { uuid: savedSemanticViewerChartUuid },
    });

    const chartUpdateMutation = useSavedSemanticViewerChartUpdateMutation({
        projectUuid,
    });

    const handleUpdate = useCallback(async () => {
        if (
            !savedChartQuery.isSuccess ||
            !savedSemanticViewerChartUuid ||
            !activeChartKind ||
            !selectedChartConfig
        )
            return;

        await chartUpdateMutation.mutateAsync({
            uuid: savedSemanticViewerChartUuid,
            payload: {
                unversionedData: {
                    name,
                    description: savedChartQuery.data.description,
                    spaceUuid: savedChartQuery.data.space.uuid,
                },
                versionedData: {
                    chartKind: activeChartKind,
                    config: selectedChartConfig,
                    semanticLayerQuery,
                    // TODO: view should never be ''. this is a temporary fix for semantic layers without views
                    semanticLayerView: semanticLayerView ?? '',
                },
            },
        });

        showToastSuccess({
            title: 'Chart saved successfully!',
        });
    }, [
        activeChartKind,
        chartUpdateMutation,
        name,
        savedChartQuery.data,
        savedChartQuery.isSuccess,
        savedSemanticViewerChartUuid,
        selectedChartConfig,
        semanticLayerQuery,
        semanticLayerView,
        showToastSuccess,
    ]);

    const canSave = selectedFieldNames.length > 0 && !!selectedChartConfig;

    return (
        <>
            <Input
                w="100%"
                placeholder="Untitled chart"
                value={name}
                onChange={(e) => {
                    dispatch(updateName(e.currentTarget.value));
                }}
                styles={{
                    input: {
                        background: 'transparent',
                        border: 0,

                        '&:hover': {
                            background: theme.colors.gray[2],
                        },
                        '&:focus': {
                            background: theme.colors.gray[3],
                        },
                    },
                }}
            />

            <Button
                compact
                leftIcon={<MantineIcon icon={IconDeviceFloppy} />}
                variant="link"
                disabled={!canSave}
                onClick={
                    savedSemanticViewerChartUuid
                        ? handleUpdate
                        : handleOpenSaveModal
                }
            >
                Save
            </Button>
        </>
    );
};

export default SaveSemanticViewerChart;
