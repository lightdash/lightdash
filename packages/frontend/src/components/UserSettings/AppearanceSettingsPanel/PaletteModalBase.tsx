import {
    Box,
    Button,
    ColorInput,
    Group,
    Modal,
    Paper,
    ScrollArea,
    SimpleGrid,
    Stack,
    Text,
    TextInput,
    type ModalProps,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconChevronDown, IconPalette } from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import { ChartPreviewComponent } from './ChartPreviewComponent';

export interface PaletteFormValues {
    name?: string;
    colors: string[];
}

export type PaletteModalBaseProps = Pick<ModalProps, 'opened' | 'onClose'> & {
    onSubmit: (values: PaletteFormValues) => void;
    isLoading: boolean;
    initialValues: PaletteFormValues;
    title: string;
    submitButtonText: string;
    existingPaletteNames?: string[];
};

export const PaletteModalBase: FC<PaletteModalBaseProps> = ({
    opened,
    onClose,
    onSubmit,
    isLoading,
    initialValues,
    title,
    submitButtonText,
    existingPaletteNames = [],
}) => {
    const [showAllColors, setShowAllColors] = useState(false);

    const form = useForm<PaletteFormValues>({
        initialValues,
        validate: {
            name: (value) => {
                if (!value || value.trim().length < 3) {
                    return 'Name must be at least 3 characters';
                }
                if (existingPaletteNames.includes(value)) {
                    return 'Name must be unique';
                }
                return null;
            },
            colors: (value) =>
                value.every((c) => c.startsWith('#')) ? null : 'Invalid colors',
        },
    });

    const handleFormSubmit = form.onSubmit((values) => {
        onSubmit(values);
        onClose();
        form.reset();
    });

    return (
        <Modal.Root opened={opened} onClose={onClose} size="lg" centered>
            <Modal.Overlay />
            <Modal.Content
                sx={{
                    maxWidth: '800px',
                    margin: '0 auto',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <Modal.Header
                    sx={(theme) => ({
                        borderBottom: `1px solid ${theme.colors.gray[2]}`,
                        padding: theme.spacing.sm,
                    })}
                >
                    <Group spacing="xs">
                        <Paper p="xs" withBorder radius="sm">
                            <MantineIcon icon={IconPalette} size="sm" />
                        </Paper>
                        <Text color="dark.7" fw={700} fz="md">
                            {title}
                        </Text>
                    </Group>
                    <Modal.CloseButton />
                </Modal.Header>

                <form
                    onSubmit={handleFormSubmit}
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        flex: 1,
                    }}
                >
                    <Modal.Body
                        p={0}
                        sx={{
                            flex: 1,
                            overflow: 'auto',
                            maxHeight: 'calc(80vh - 130px)', // Adjust height to leave space for header and footer
                        }}
                    >
                        <Stack p="sm" spacing="xs">
                            <TextInput
                                label="Palette name"
                                placeholder="Enter a unique name"
                                required
                                size="sm"
                                {...form.getInputProps('name')}
                            />

                            <Group
                                align="flex-start"
                                spacing={0}
                                noWrap
                                h="100%"
                                mah={320}
                                sx={(theme) => ({
                                    border: `1px solid ${theme.colors.gray[2]}`,
                                    borderRadius: theme.radius.md,
                                    overflow: 'scroll',
                                })}
                            >
                                {/* Left side - Color inputs */}
                                <Box
                                    w={250}
                                    miw={250}
                                    p="sm"
                                    // Address scrollarea right padding
                                    pr={0}
                                    pb="xs"
                                    sx={(theme) => ({
                                        borderRight: `1px solid ${theme.colors.gray[2]}`,
                                    })}
                                >
                                    <ScrollArea
                                        h={260}
                                        offsetScrollbars
                                        styles={{
                                            viewport: {
                                                maxHeight: 260,
                                            },
                                        }}
                                    >
                                        <SimpleGrid cols={2} spacing="two">
                                            {form.values.colors
                                                .slice(
                                                    0,
                                                    showAllColors
                                                        ? form.values.colors
                                                              .length
                                                        : 10,
                                                )
                                                .map((color, index) => (
                                                    <ColorInput
                                                        key={index}
                                                        label={`#${index + 1}`}
                                                        labelProps={{
                                                            size: 10,
                                                            color: 'gray.4',
                                                        }}
                                                        value={color}
                                                        onChange={(newColor) =>
                                                            form.setFieldValue(
                                                                `colors.${index}`,
                                                                newColor,
                                                            )
                                                        }
                                                        swatches={
                                                            form.values.colors
                                                        }
                                                        format="hex"
                                                        size="xs"
                                                        withPicker
                                                        withEyeDropper={false}
                                                    />
                                                ))}
                                        </SimpleGrid>
                                    </ScrollArea>

                                    <Button
                                        variant="subtle"
                                        color="blue"
                                        size="xs"
                                        compact
                                        onClick={() =>
                                            setShowAllColors(!showAllColors)
                                        }
                                        rightIcon={
                                            <MantineIcon
                                                icon={IconChevronDown}
                                                size="xs"
                                            />
                                        }
                                        fullWidth
                                        sx={{ alignSelf: 'flex-end' }}
                                    >
                                        {showAllColors
                                            ? 'Show fewer colors'
                                            : 'Show all colors'}
                                    </Button>
                                </Box>

                                {/* Right side - Chart preview */}
                                <ChartPreviewComponent
                                    colors={form.values.colors}
                                />
                            </Group>
                        </Stack>
                    </Modal.Body>

                    <Box
                        sx={(theme) => ({
                            borderTop: `1px solid ${theme.colors.gray[2]}`,
                            padding: theme.spacing.sm,
                            backgroundColor: theme.white,
                            position: 'sticky',
                            bottom: 0,
                            width: '100%',
                            zIndex: 10,
                        })}
                    >
                        <Group position="right" spacing="xs">
                            <Button variant="default" h={32} onClick={onClose}>
                                Cancel
                            </Button>
                            <Button
                                h={32}
                                type="submit"
                                loading={isLoading}
                                disabled={!form.isDirty() || !form.isValid()}
                            >
                                {submitButtonText}
                            </Button>
                        </Group>
                    </Box>
                </form>
            </Modal.Content>
        </Modal.Root>
    );
};
