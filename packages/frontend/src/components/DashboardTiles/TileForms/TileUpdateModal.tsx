import {
    DashboardTileTypes,
    assertUnreachable,
    type Dashboard,
    type DashboardDividerTileProperties,
    type DashboardHeadingTileProperties,
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
import {
    IconHeading,
    IconMarkdown,
    IconMinus,
    IconVideo,
} from '@tabler/icons-react';
import { produce } from 'immer';
import { useCallback } from 'react';
import MantineIcon from '../../common/MantineIcon';
import DividerTileForm from './DividerTileForm';
import HeadingTileForm from './HeadingTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';
import { getLoomId, markdownTileContentTransform } from './utils';

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
        const textValidator = {
            text: (value: string | undefined) =>
                !value || !value.length ? 'Required field' : null,
        };
        const orientationValidator = {
            orientation: (value: string | undefined) =>
                value === 'horizontal' || value === 'vertical'
                    ? null
                    : 'Required field',
        };

        if (tile.type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
        if (tile.type === DashboardTileTypes.HEADING) return textValidator;
        if (tile.type === DashboardTileTypes.DIVIDER)
            return orientationValidator;
    };

    const form = useForm<TileProperties>({
        initialValues: { ...tile.properties },
        validate: getValidators(),
        validateInputOnChange: ['title', 'url', 'text', 'orientation'],
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

    const getTileIcon = useCallback(() => {
        const { type } = tile;
        switch (type) {
            case DashboardTileTypes.MARKDOWN:
                return <IconMarkdown />;
            case DashboardTileTypes.LOOM:
                return <IconVideo />;
            case DashboardTileTypes.HEADING:
                return <IconHeading />;
            case DashboardTileTypes.DIVIDER:
                return <IconMinus />;
            case DashboardTileTypes.SAVED_CHART:
                return null;
            case DashboardTileTypes.SQL_CHART:
                return null;
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [tile]);

    return (
        <Modal
            size="xl"
            title={
                <Group spacing="xs">
                    <MantineIcon size="lg" color="blue.8" icon={getTileIcon} />
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
                    ) : tile.type === DashboardTileTypes.HEADING ? (
                        <HeadingTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardHeadingTileProperties['properties']
                                >
                            }
                        />
                    ) : tile.type === DashboardTileTypes.DIVIDER ? (
                        <DividerTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardDividerTileProperties['properties']
                                >
                            }
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
