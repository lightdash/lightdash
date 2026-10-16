import {
    assertUnreachable,
    DashboardTileTypes,
    defaultTileSize,
    type Dashboard,
    type DashboardDataAppTileProperties,
    type DashboardHeadingTileProperties,
    type DashboardLoomTileProperties,
    type DashboardMarkdownTile,
    type DashboardMarkdownTileProperties,
} from '@lightdash/common';
import { Button, Stack, Text } from '@mantine/core';
import { useForm, type UseFormReturnType } from '@mantine/form';
import {
    IconAppWindow,
    IconHeading,
    IconMarkdown,
    IconVideo,
} from '@tabler/icons-react';
import { useMemo, useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuid4 } from 'uuid';
import MantineModal from '../../common/MantineModal';
import DataAppTileForm from './DataAppTileForm';
import HeadingTileForm from './HeadingTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';
import { getLoomId, markdownTileContentTransform } from './utils';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

type AddProps = {
    opened: boolean;
    onClose: () => void;
    type:
        | DashboardTileTypes.LOOM
        | DashboardTileTypes.MARKDOWN
        | DashboardTileTypes.HEADING
        | DashboardTileTypes.DATA_APP;
    onConfirm: (tile: Tile) => void;
};

export const TileAddModal: FC<AddProps> = ({
    opened,
    type,
    onClose,
    onConfirm,
}) => {
    const { t } = useTranslation('dashboard');
    const [errorMessage, setErrorMessage] = useState<string>();

    const getValidators = () => {
        const urlValidator = {
            url: (value: string | undefined) =>
                getLoomId(value)
                    ? null
                    : t('tileForms.validation.invalidLoomUrl'),
        };
        const titleValidator = {
            title: (value: string | undefined) =>
                !value || !value.length
                    ? t('tileForms.validation.required')
                    : null,
        };
        const textValidator = {
            text: (value: string | undefined) =>
                !value || !value.length
                    ? t('tileForms.validation.required')
                    : null,
        };
        const appUuidValidator = {
            appUuid: (value: string | undefined) =>
                !value || !value.length
                    ? t('tileForms.validation.required')
                    : null,
        };
        if (type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
        if (type === DashboardTileTypes.HEADING) return textValidator;
        if (type === DashboardTileTypes.DATA_APP)
            return { ...titleValidator, ...appUuidValidator };
    };

    const form = useForm<TileProperties>({
        validate: getValidators(),
        validateInputOnChange: ['title', 'url', 'content', 'text'],
        transformValues(values) {
            if (type === DashboardTileTypes.MARKDOWN) {
                return markdownTileContentTransform(
                    values as DashboardMarkdownTile['properties'],
                );
            }

            return values;
        },
    });

    const tileIcon = useMemo(() => {
        switch (type) {
            case DashboardTileTypes.MARKDOWN:
                return IconMarkdown;
            case DashboardTileTypes.LOOM:
                return IconVideo;
            case DashboardTileTypes.HEADING:
                return IconHeading;
            case DashboardTileTypes.DATA_APP:
                return IconAppWindow;
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [type]);

    const tileTitle = useMemo(() => {
        switch (type) {
            case DashboardTileTypes.MARKDOWN:
                return t('tileForms.addTitle.markdown');
            case DashboardTileTypes.LOOM:
                return t('tileForms.addTitle.loom');
            case DashboardTileTypes.HEADING:
                return t('tileForms.addTitle.heading');
            case DashboardTileTypes.DATA_APP:
                return t('tileForms.addTitle.dataApp');
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [type, t]);

    if (!type) return null;

    const handleConfirm = form.onSubmit(({ ...properties }) => {
        if (type === DashboardTileTypes.MARKDOWN) {
            const markdownForm = properties as any;
            if (!markdownForm.title && !markdownForm.content) {
                setErrorMessage(
                    t('tileForms.validation.titleOrContentRequired'),
                );
                return;
            }
        }

        let size = defaultTileSize;

        if (type === DashboardTileTypes.HEADING) {
            size = {
                ...defaultTileSize,
                h: 1,
                w: 36,
            };
        }
        onConfirm({
            uuid: uuid4(),
            properties: properties as any,
            type,
            tabUuid: undefined,
            ...size,
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
        <MantineModal
            opened={opened}
            onClose={handleClose}
            title={tileTitle}
            icon={tileIcon}
            size="xl"
            actions={
                <Button
                    type="submit"
                    form="add-tile-form"
                    disabled={!form.isValid()}
                >
                    {t('actions.add', { ns: 'common' })}
                </Button>
            }
        >
            <form
                id="add-tile-form"
                onSubmit={handleConfirm}
                data-testid="add-tile-form"
            >
                <Stack gap="lg">
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
                    ) : type === DashboardTileTypes.HEADING ? (
                        <HeadingTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardHeadingTileProperties['properties']
                                >
                            }
                        />
                    ) : type === DashboardTileTypes.DATA_APP ? (
                        <DataAppTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardDataAppTileProperties['properties']
                                >
                            }
                        />
                    ) : (
                        assertUnreachable(type, 'Tile type not supported')
                    )}

                    {errorMessage && (
                        <Text c="red" fz="sm">
                            {errorMessage}
                        </Text>
                    )}
                </Stack>
            </form>
        </MantineModal>
    );
};
