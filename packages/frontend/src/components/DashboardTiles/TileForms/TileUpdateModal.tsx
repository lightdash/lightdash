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
    DashboardTileTypes,
} from '@lightdash/common';
import produce from 'immer';
import { useForm } from 'react-hook-form';
import Form from '../../ReactHookForm/Form';
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
        mode: 'onChange',
        defaultValues: tile.properties,
    });

    const handleConfirm = async (properties: TileProperties) => {
        onConfirm?.(
            produce(tile, (draft) => {
                draft.properties = properties;
            }),
        );
    };

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    return (
        <Dialog
            lazy
            title="Edit tile content"
            {...modalProps}
            onClose={handleClose}
        >
            <Form
                name="Edit tile content"
                methods={form}
                onSubmit={handleConfirm}
            >
                <DialogBody>
                    {tile.type === DashboardTileTypes.SAVED_CHART ? (
                        <ChartTileForm />
                    ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                        <MarkdownTileForm />
                    ) : tile.type === DashboardTileTypes.LOOM ? (
                        <LoomTileForm />
                    ) : (
                        assertUnreachable(tile, 'Tile type not supported')
                    )}
                </DialogBody>

                <DialogFooter
                    actions={
                        <>
                            <Button onClick={handleClose}>Cancel</Button>

                            <Button
                                intent="primary"
                                type="submit"
                                disabled={!form.formState.isValid}
                            >
                                Save
                            </Button>
                        </>
                    }
                />
            </Form>
        </Dialog>
    );
};

export default TileUpdateModal;
