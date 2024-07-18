import {
    assertUnreachable,
    DashboardTileTypes,
    type Dashboard,
    type DashboardLoomTileProperties,
    type DashboardMarkdownTile,
    type DashboardMarkdownTileProperties,
} from '@lightdash/common';
import {
    Button,
    Group,
    Modal,
    Stack,
    Title,
    type ModalProps,
} from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconMarkdown, IconVideo } from '@tabler/icons-react';
import { produce } from 'immer';
import MantineIcon from '../../common/MantineIcon';
import LoomTileForm, { getLoomId } from './LoomTileForm';
import MarkdownTileForm, {
    markdownTileContentTransform,
} from './MarkdownTileForm';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

interface TileUpdateModalProps<T> extends ModalProps {
    tile: T;
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
        initialValues: { ...tile.properties },
        validate: getValidators(),
        validateInputOnChange: ['title', 'url'],
        transformValues(values) {
            if (tile.type === DashboardTileTypes.MARKDOWN) {
                return markdownTileContentTransform(
                    values as DashboardMarkdownTile['properties'],
                );
            }

            return values;
        },
    });

    const handleConfirm = form.onSubmit(({ ...properties }) => {
        onConfirm?.(
            produce(tile, (draft) => {
                draft.properties = properties;
            }),
        );
    });

    return (
        <Modal
            size="xl"
            title={
                <Group spacing="xs">
                    <MantineIcon
                        size="lg"
                        color="blue.8"
                        icon={
                            tile.type === DashboardTileTypes.MARKDOWN
                                ? IconMarkdown
                                : IconVideo
                        }
                    />
                    <Title order={4}>Edit {tile.type} tile</Title>
                </Group>
            }
            {...modalProps}
            onClose={() => onClose?.()}
        >
            <form onSubmit={handleConfirm}>
                <Stack spacing="lg" pt="sm">
                    {tile.type === DashboardTileTypes.SAVED_CHART ||
                    tile.type ===
                        DashboardTileTypes.SQL_CHART ? null : tile.type ===
                      DashboardTileTypes.MARKDOWN ? (
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

                    <Group position="right" mt="sm">
                        <Button variant="outline" onClick={() => onClose?.()}>
                            Cancel
                        </Button>

                        <Button type="submit" disabled={!form.isValid()}>
                            Save
                        </Button>
                    </Group>
                </Stack>
            </form>
        </Modal>
    );
};

export default TileUpdateModal;
