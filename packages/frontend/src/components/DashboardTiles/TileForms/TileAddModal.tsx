import {
    DashboardTileTypes,
    assertUnreachable,
    defaultTileSize,
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
import { useCallback, useState, type FC } from 'react';
import { v4 as uuid4 } from 'uuid';
import MantineIcon from '../../common/MantineIcon';
import DividerTileForm from './DividerTileForm';
import HeadingTileForm from './HeadingTileForm';
import LoomTileForm from './LoomTileForm';
import MarkdownTileForm from './MarkdownTileForm';
import { getLoomId, markdownTileContentTransform } from './utils';

type Tile = Dashboard['tiles'][number];
type TileProperties = Tile['properties'];

type AddProps = ModalProps & {
    type:
        | DashboardTileTypes.LOOM
        | DashboardTileTypes.MARKDOWN
        | DashboardTileTypes.HEADING
        | DashboardTileTypes.DIVIDER;
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
        if (type === DashboardTileTypes.LOOM)
            return { ...urlValidator, ...titleValidator };
        if (type === DashboardTileTypes.HEADING) return textValidator;
        if (type === DashboardTileTypes.DIVIDER) return orientationValidator;
    };

    const form = useForm<TileProperties>({
        validate: getValidators(),
        validateInputOnChange: [
            'title',
            'url',
            'content',
            'text',
            'orientation',
        ],
        transformValues(values) {
            if (type === DashboardTileTypes.MARKDOWN) {
                return markdownTileContentTransform(
                    values as DashboardMarkdownTile['properties'],
                );
            }

            return values;
        },
    });

    const getTileIcon = useCallback(() => {
        switch (type) {
            case DashboardTileTypes.MARKDOWN:
                return IconMarkdown;
            case DashboardTileTypes.LOOM:
                return IconVideo;
            case DashboardTileTypes.HEADING:
                return IconHeading;
            case DashboardTileTypes.DIVIDER:
                return IconMinus;
            default:
                return assertUnreachable(type, 'Tile type not supported');
        }
    }, [type]);

    if (!type) return null;

    const handleConfirm = form.onSubmit(({ ...properties }) => {
        if (type === DashboardTileTypes.MARKDOWN) {
            const markdownForm = properties as any;
            if (!markdownForm.title && !markdownForm.content) {
                setErrorMessage('Title or content is required');
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

        if (type === DashboardTileTypes.DIVIDER) {
            const dividerProps =
                properties as DashboardDividerTileProperties['properties'];
            size = {
                ...defaultTileSize,
                h: dividerProps.orientation === 'horizontal' ? 1 : 9,
                w: dividerProps.orientation === 'horizontal' ? 36 : 1,
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
        <Modal
            title={
                <Group spacing="xs">
                    <MantineIcon
                        size="lg"
                        color="blue.6"
                        icon={getTileIcon()}
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
                    ) : type === DashboardTileTypes.HEADING ? (
                        <HeadingTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardHeadingTileProperties['properties']
                                >
                            }
                        />
                    ) : type === DashboardTileTypes.DIVIDER ? (
                        <DividerTileForm
                            form={
                                form as UseFormReturnType<
                                    DashboardDividerTileProperties['properties']
                                >
                            }
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
