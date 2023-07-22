import {
    Button,
    Dialog,
    DialogBody,
    DialogFooter,
    DialogProps,
} from '@blueprintjs/core';
import {
    assertUnreachable,
    Dashboard,
    DashboardLoomTileProperties,
    DashboardTile,
    DashboardTileTypes,
} from '@lightdash/common';
import { useForm, UseFormReturnType } from '@mantine/form';
import produce from 'immer';
import ChartTileForm from './ChartTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

interface TileUpdateModalProps<T> extends DialogProps {
    tile: T;
    onClose?: () => void;
    onConfirm?: (tile: T) => void;
}

const TileUpdateModal = <T extends Tile>({
    tile,
    onClose,
    onConfirm,
    ...modalProps
}: TileUpdateModalProps<T>) => {
    const form = useForm<TileProperties>({
        initialValues: tile.properties,
    });

    const handleConfirm = form.onSubmit(({ ...properties }) => {
        onConfirm?.(
            produce(tile, (draft) => {
                draft.properties = properties;
            }),
        );
    });

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    const getTileForm = (dashboardTile: DashboardTile) => {
        switch (dashboardTile.type) {
            case DashboardTileTypes.SAVED_CHART: {
                return <ChartTileForm />;
            }
            case DashboardTileTypes.MARKDOWN: {
                return <MarkdownTileForm />;
            }
            case DashboardTileTypes.LOOM: {
                return (
                    <LoomTileForm
                        form={
                            form as UseFormReturnType<
                                DashboardLoomTileProperties['properties']
                            >
                        }
                    />
                );
            }
            default:
                assertUnreachable(dashboardTile, 'Tile type not supported');
        }
    };

    return (
        <Dialog
            lazy
            title="Edit tile content"
            {...modalProps}
            onClose={handleClose}
            backdropClassName="non-draggable"
        >
            <form onSubmit={handleConfirm}>
                <DialogBody>{getTileForm(tile)}</DialogBody>

                <DialogFooter
                    actions={
                        <>
                            <Button onClick={handleClose}>Cancel</Button>

                            <Button
                                intent="primary"
                                type="submit"
                                disabled={!form.isValid}
                            >
                                Save
                            </Button>
                        </>
                    }
                />
            </form>
        </Dialog>
    );
};

export default TileUpdateModal;
