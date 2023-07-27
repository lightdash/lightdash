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
    DashboardMarkdownTileProperties,
    DashboardTileTypes,
} from '@lightdash/common';
import { useForm, UseFormReturnType } from '@mantine/form';
import produce from 'immer';
import ChartTileForm from './ChartTileForm';
import LoomTileForm, { getLoomId } from './LoomTileForm';
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
    const getValidators = () => {
        const urlValidator = {
            url: (value: string | undefined) =>
                getLoomId(value) ? null : 'Loom url not valid',
        };
        const titleValidator = {
            title: (value: string | undefined) => {
                return !value || !value.length ? 'Required field' : null;
            },
        };

        if (tile.type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
    };

    const form = useForm<TileProperties>({
        initialValues: tile.properties,
        validate: getValidators(),
        validateInputOnChange: ['title', 'url'],
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

    return (
        <Dialog
            lazy
            title="Edit tile content"
            {...modalProps}
            onClose={handleClose}
            backdropClassName="non-draggable"
        >
            <form onSubmit={handleConfirm}>
                <DialogBody>
                    {tile.type === DashboardTileTypes.SAVED_CHART ? (
                        <ChartTileForm />
                    ) : tile.type === DashboardTileTypes.MARKDOWN ? (
                        <MarkdownTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardMarkdownTileProperties['properties']
                                >
                            }
                        />
                    ) : tile.type === DashboardTileTypes.LOOM ? (
                        <LoomTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardLoomTileProperties['properties']
                                >
                            }
                            withHideTitle
                        />
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
                                disabled={!form.isValid()}
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
