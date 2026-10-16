import {
    assertUnreachable,
    DashboardTileTypes,
    type Dashboard,
    type DashboardDataAppTileProperties,
    type DashboardHeadingTileProperties,
    type DashboardLoomTileProperties,
    type DashboardMarkdownTile,
    type DashboardMarkdownTileProperties,
} from '@lightdash/common';
import { Button, Stack, type ModalProps } from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import {
    IconAppWindow,
    IconHeading,
    IconMarkdown,
    IconVideo,
} from '@tabler/icons-react';
import { produce } from 'immer';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import MantineModal from '../../common/MantineModal';
import DataAppTileEditForm from './DataAppTileEditForm';
import HeadingTileForm from './HeadingTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';
import { getLoomId, markdownTileContentTransform } from './utils';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

interface TileUpdateModalProps<T> extends Pick<
    ModalProps,
    'opened' | 'onClose' | 'className'
> {
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
    const { t } = useTranslation('dashboard');
    const getValidators = () => {
        const urlValidator = {
            url: (value: string | undefined) =>
                getLoomId(value)
                    ? null
                    : t('tileForms.validation.invalidLoomUrl'),
        };
        const titleValidator = {
            title: (value: string | undefined) => {
                return !value || !value.length
                    ? t('tileForms.validation.required')
                    : null;
            },
        };
        const textValidator = {
            text: (value: string | undefined) =>
                !value || !value.length
                    ? t('tileForms.validation.required')
                    : null,
        };

        if (tile.type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
        if (tile.type === DashboardTileTypes.HEADING) return textValidator;
        if (tile.type === DashboardTileTypes.DATA_APP) return titleValidator;
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
            case DashboardTileTypes.DATA_APP:
                return IconAppWindow;
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
                return t('tileForms.editTitle.markdown');
            case DashboardTileTypes.LOOM:
                return t('tileForms.editTitle.loom');
            case DashboardTileTypes.HEADING:
                return t('tileForms.editTitle.heading');
            case DashboardTileTypes.DATA_APP:
                return t('tileForms.editTitle.dataApp');
            case DashboardTileTypes.SAVED_CHART:
                return t('tileForms.editTitle.savedChart');
            case DashboardTileTypes.SQL_CHART:
                return t('tileForms.editTitle.sqlChart');
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [tile, t]);

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
                    {t('actions.save', { ns: 'common' })}
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
                    ) : tile.type === DashboardTileTypes.DATA_APP ? (
                        <DataAppTileEditForm
                            form={
                                form as UseFormReturnType<
                                    DashboardDataAppTileProperties['properties']
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
