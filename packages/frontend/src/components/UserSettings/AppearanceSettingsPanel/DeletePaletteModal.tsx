import { type OrganizationColorPalette } from '@lightdash/common';
import {
    type ModalProps,
    Button,
    Center,
    ColorSwatch,
    Group,
    Modal,
    Paper,
    SimpleGrid,
    Stack,
    Text,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';

type DeletePaletteModalProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    palette: OrganizationColorPalette;
    onConfirm: () => void;
};

export const DeletePaletteModal: FC<DeletePaletteModalProps> = ({
    palette,
    opened,
    onClose,
    onConfirm,
}) => (
    <Modal
        radius="sm"
        opened={opened}
        onClose={onClose}
        title={
            <Group>
                <Paper p="xs" withBorder radius="sm">
                    <MantineIcon icon={IconTrash} size="sm" color="red" />
                </Paper>
                <Text color="ldDark.7" fw={500} fz="md">
                    Delete "{palette.name}" Palette
                </Text>
            </Group>
        }
        styles={(theme) => ({
            header: {
                borderBottom: `1px solid ${theme.colors.ldGray[2]}`,
            },
            body: {
                padding: 0,
            },
        })}
        size="md"
    >
        <Stack p="md" spacing="xs">
            <Text size="sm" color="ldGray.6">
                Are you sure you want to delete this color palette? This action
                cannot be undone.
            </Text>

            <Center>
                <SimpleGrid cols={10} spacing="xs">
                    {palette.colors.map((color, index) => (
                        <ColorSwatch
                            key={color + index}
                            size={24}
                            color={color}
                        />
                    ))}
                </SimpleGrid>
            </Center>
        </Stack>

        <Group
            position="right"
            p="md"
            spacing="xs"
            sx={(theme) => ({
                borderTop: `1px solid ${theme.colors.ldGray[2]}`,
            })}
        >
            <Button variant="default" size="xs" h={32} onClick={onClose}>
                Cancel
            </Button>
            <Button color="red" onClick={onConfirm} size="xs" h={32}>
                Delete Palette
            </Button>
        </Group>
    </Modal>
);
