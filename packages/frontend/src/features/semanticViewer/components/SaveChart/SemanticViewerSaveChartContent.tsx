import { Button, Input, useMantineTheme } from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../../../components/common/MantineIcon';
import { selectChartConfigByKind } from '../../../../components/DataViz/store/selectors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { selectSemanticLayerQuery } from '../../store/selectors';
import {
    updateName,
    updateSaveModalOpen,
} from '../../store/semanticViewerSlice';

const SemanticViewerSaveChartContent: FC = () => {
    const theme = useMantineTheme();
    const dispatch = useAppDispatch();

    const name = useAppSelector((state) => state.semanticViewer.name);
    const semanticLayerQuery = useAppSelector(selectSemanticLayerQuery);
    const activeChartKind = useAppSelector(
        (state) => state.semanticViewer.activeChartKind,
    );
    const selectedChartConfig = useAppSelector((state) =>
        selectChartConfigByKind(state, activeChartKind),
    );

    const handleOpenSaveModal = () => {
        dispatch(updateSaveModalOpen(true));
    };

    const canSave = !!semanticLayerQuery && !!selectedChartConfig;

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
                p={0}
                leftIcon={<MantineIcon icon={IconDeviceFloppy} />}
                variant="link"
                color="black"
                disabled={!canSave}
                onClick={handleOpenSaveModal}
            >
                Save
            </Button>
        </>
    );
};

export default SemanticViewerSaveChartContent;
