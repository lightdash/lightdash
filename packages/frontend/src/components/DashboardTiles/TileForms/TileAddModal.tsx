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
    defaultTileSize,
} from '@lightdash/common';
import { FC, useState } from 'react';
import { useForm } from 'react-hook-form';
import { v4 as uuid4 } from 'uuid';
import Form from '../../ReactHookForm/Form';
import ChartTileForm from './ChartTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

interface AddProps extends DialogProps {
    type?: DashboardTileTypes;
    onClose?: () => void;
    onConfirm: (tile: Tile) => void;
}

export const TileAddModal: FC<AddProps> = ({
    type,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const [errorMessage, setErrorMessage] = useState<string>();

    const form = useForm<TileProperties>({
        mode: 'onChange',
    });

    if (!type) return null;

    const handleConfirm = (properties: TileProperties) => {
        if (type === DashboardTileTypes.MARKDOWN) {
            const markdownForm = properties as any;
            if (!markdownForm.title && !markdownForm.content) {
                setErrorMessage('Title or content is required');
                return;
            }
        }

        onConfirm({
            uuid: uuid4(),
            properties: properties as any,
            type,
            ...defaultTileSize,
        });
    };

    const handleClose = () => {
        form.reset();
        onClose?.();
    };

    return (
        <Dialog
            lazy
            title="Add tile to dashboard"
            {...modalProps}
            onClose={handleClose}
        >
            <Form
                title="Add tile to dashboard"
                methods={form}
                onSubmit={handleConfirm}
            >
                <DialogBody>
                    {type === DashboardTileTypes.SAVED_CHART ? (
                        <ChartTileForm />
                    ) : type === DashboardTileTypes.MARKDOWN ? (
                        <MarkdownTileForm />
                    ) : type === DashboardTileTypes.LOOM ? (
                        <LoomTileForm />
                    ) : (
                        assertUnreachable(type, 'Tile type not supported')
                    )}
                </DialogBody>

                <DialogFooter
                    actions={
                        <>
                            {errorMessage}

                            <Button onClick={handleClose}>Cancel</Button>

                            <Button
                                intent="primary"
                                type="submit"
                                disabled={!form.formState.isValid}
                            >
                                Add
                            </Button>
                        </>
                    }
                />
            </Form>
        </Dialog>
    );
};
