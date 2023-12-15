import {
    assertUnreachable,
    Dashboard,
    DashboardLoomTileProperties,
    DashboardMarkdownTileProperties,
    DashboardTileTypes,
    defaultTileSize,
} from '@lightdash/common';
import { Button, Group, Modal, ModalProps, Stack, Title } from '@mantine/core';
import { useForm, UseFormReturnType } from '@mantine/form';
import { IconMarkdown, IconVideo } from '@tabler/icons-react';
import { FC, useState } from 'react';
import { v4 as uuid4 } from 'uuid';
import MantineIcon from '../../common/MantineIcon';
import LoomTileForm, { getLoomId } from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

type AddProps = ModalProps & {
    type: DashboardTileTypes.LOOM | DashboardTileTypes.MARKDOWN;
    onConfirm: (tile: Tile) => void;
};

export const TileAddModal: FC<AddProps> = ({
    type,
    onClose,
    onConfirm,
    ...modalProps
}) => {
    const [errorMessage, setErrorMessage] = useState<string>();

    const getValidators = () => {
        const urlValidator = {
            url: (value: string | undefined) =>
                getLoomId(value) ? null : 'Loom url not valid',
        };
        const titleValidator = {
            title: (value: string | undefined) =>
                !value || !value.length ? 'Required field' : null,
        };
        if (type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
    };

    const form = useForm<TileProperties>({
        validate: getValidators(),
        validateInputOnChange: ['title', 'url', 'content'],
    });

    if (!type) return null;

    const handleConfirm = form.onSubmit(({ ...properties }) => {
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
        form.reset();
        setErrorMessage('');
    });

    const handleClose = () => {
        form.reset();
        setErrorMessage('');
        onClose?.();
    };

    return (
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon
                        size="lg"
                        color="blue.8"
                        icon={
                            type === DashboardTileTypes.MARKDOWN
                                ? IconMarkdown
                                : IconVideo
                        }
                    />
                    <Title order={4}>Add {type} tile</Title>
                </Group>
            }
            {...modalProps}
            size="xl"
            onClose={handleClose}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    {type === DashboardTileTypes.MARKDOWN ? (
                        <MarkdownTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardMarkdownTileProperties['properties']
                                >
                            }
                        />
                    ) : type === DashboardTileTypes.LOOM ? (
                        <LoomTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardLoomTileProperties['properties']
                                >
                            }
                            withHideTitle={false}
                        />
                    ) : (
                        assertUnreachable(type, 'Tile type not supported')
                    )}

                    {errorMessage}

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={handleClose}>
                            Cancel
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            Add
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};
