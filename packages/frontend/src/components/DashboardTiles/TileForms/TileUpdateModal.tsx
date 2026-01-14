import {
    DashboardTileTypes,
    assertUnreachable,
    type Dashboard,
    type DashboardHeadingTileProperties,
    type DashboardLoomTileProperties,
    type DashboardMarkdownTile,
    type DashboardMarkdownTileProperties,
} from '@lightdash/common';
import { Button, Stack, type ModalProps } from '@mantine-8/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import { IconHeading, IconMarkdown, IconVideo } from '@tabler/icons-react';
import { produce } from 'immer';
import { useMemo } from 'react';
import MantineModal from '../../common/MantineModal';
import HeadingTileForm from './HeadingTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';
import { getLoomId, markdownTileContentTransform } from './utils';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

interface TileUpdateModalProps<T>
    extends Pick<ModalProps, 'opened' | 'onClose' | 'className'> {
    tile: T;
    onConfirm?: (tile: T) => void;
}

const TileUpdateModal = <T extends Tile>({
    opened,
    tile,
    onClose,
    onConfirm,
    className,
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

        if (tile.type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
        if (tile.type === DashboardTileTypes.HEADING) return textValidator;
    };

    const form = useForm<TileProperties>({
        initialValues: { ...tile.properties },
        validate: getValidators(),
        validateInputOnChange: ['title', 'url', 'text'],
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

    const tileIcon = useMemo(() => {
        const { type } = tile;
        switch (type) {
            case DashboardTileTypes.MARKDOWN:
                return IconMarkdown;
            case DashboardTileTypes.LOOM:
                return IconVideo;
            case DashboardTileTypes.HEADING:
                return IconHeading;
            case DashboardTileTypes.SAVED_CHART:
                return undefined;
            case DashboardTileTypes.SQL_CHART:
                return undefined;
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [tile]);

    const tileTitle = useMemo(() => {
        const { type } = tile;
        switch (type) {
            case DashboardTileTypes.MARKDOWN:
                return 'Edit markdown tile';
            case DashboardTileTypes.LOOM:
                return 'Edit loom tile';
            case DashboardTileTypes.HEADING:
                return 'Edit heading tile';
            case DashboardTileTypes.SAVED_CHART:
                return 'Edit saved_chart tile';
            case DashboardTileTypes.SQL_CHART:
                return 'Edit sql_chart tile';
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [tile]);

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={tileTitle}
            icon={tileIcon}
            size="xl"
            modalRootProps={{ className }}
            actions={
                <Button
                    type="submit"
                    form="update-tile-form"
                    disabled={!form.isValid()}
                >
                    Save
                </Button>
            }
        >
            <form id="update-tile-form" onSubmit={handleConfirm}>
                <Stack gap="lg">
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
                    ) : (
                        assertUnreachable(tile, 'Tile type not supported')
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};

export default TileUpdateModal;
