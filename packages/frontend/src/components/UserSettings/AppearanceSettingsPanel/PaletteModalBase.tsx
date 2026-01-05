import {
    Box,
    Button,
    ColorInput,
    Group,
    ScrollArea,
    SimpleGrid,
    Stack,
    Tabs,
    TextInput,
    type ModalProps,
} from '@mantine-8/core';
import { useForm } from '@mantine/form';
import {
    IconChevronDown,
    IconMoon,
    IconPalette,
    IconSun,
} from '@tabler/icons-react';
import { useState, type FC } from 'react';
import MantineIcon from '../../common/MantineIcon';
import MantineModal from '../../common/MantineModal';
import { ChartPreviewComponent } from './ChartPreviewComponent';
import classes from './PaletteModalBase.module.css';

export interface PaletteFormValues {
    name?: string;
    colors: string[];
    darkColors?: string[];
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
    const [activeTab, setActiveTab] = useState<string | null>('light');

    const form = useForm<PaletteFormValues>({
        initialValues: {
            ...initialValues,
            darkColors: initialValues.darkColors || initialValues.colors,
        },
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
            darkColors: (value) =>
                !value || value.every((c) => c.startsWith('#'))
                    ? null
                    : 'Invalid dark colors',
        },
    });

    const handleFormSubmit = form.onSubmit((values) => {
        onSubmit(values);
        onClose();
        form.reset();
    });

    const renderColorPanel = (
        colors: string[],
        fieldPrefix: 'colors' | 'darkColors',
        backgroundColor: string,
    ) => (
        <Group
            align="flex-start"
            gap={0}
            wrap="nowrap"
            h="100%"
            mah={320}
            className={classes.colorPanel}
        >
            {/* Left side - Color inputs */}
            <Box
                w={250}
                miw={250}
                p="sm"
                pr={0}
                pb="xs"
                className={classes.colorInputs}
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
                        {colors
                            .slice(0, showAllColors ? colors.length : 10)
                            .map((color, index) => (
                                <ColorInput
                                    key={index}
                                    label={`#${index + 1}`}
                                    labelProps={{
                                        size: 'sm',
                                        c: 'ldGray.4',
                                    }}
                                    value={color}
                                    onChange={(newColor) =>
                                        form.setFieldValue(
                                            `${fieldPrefix}.${index}`,
                                            newColor,
                                        )
                                    }
                                    swatches={colors}
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
                    size="compact-xs"
                    onClick={() => setShowAllColors(!showAllColors)}
                    rightSection={
                        <MantineIcon icon={IconChevronDown} size="xs" />
                    }
                    fullWidth
                    style={{ alignSelf: 'flex-end' }}
                >
                    {showAllColors ? 'Show fewer colors' : 'Show all colors'}
                </Button>
            </Box>

            {/* Right side - Chart preview */}
            <ChartPreviewComponent
                backgroundColor={backgroundColor}
                colors={colors}
            />
        </Group>
    );

    return (
        <MantineModal
            opened={opened}
            onClose={onClose}
            title={title}
            icon={IconPalette}
            size="xl"
            actions={
                <Button
                    type="submit"
                    form="palette-form"
                    loading={isLoading}
                    disabled={!form.isDirty() || !form.isValid()}
                >
                    {submitButtonText}
                </Button>
            }
            modalBodyProps={{ px: 'md', py: 'sm' }}
        >
            <form id="palette-form" onSubmit={handleFormSubmit}>
                <Stack gap="xs">
                    <TextInput
                        label="Palette name"
                        placeholder="Enter a unique name"
                        required
                        size="sm"
                        {...form.getInputProps('name')}
                    />

                    <Tabs
                        value={activeTab}
                        onChange={setActiveTab}
                        variant="default"
                    >
                        <Tabs.List>
                            <Tabs.Tab
                                value="light"
                                leftSection={<MantineIcon icon={IconSun} />}
                            >
                                Light Mode
                            </Tabs.Tab>
                            <Tabs.Tab
                                value="dark"
                                leftSection={<MantineIcon icon={IconMoon} />}
                            >
                                Dark Mode
                            </Tabs.Tab>
                        </Tabs.List>

                        <Tabs.Panel value="light" pt="md">
                            {renderColorPanel(
                                form.values.colors,
                                'colors',
                                '#ffffff',
                            )}
                        </Tabs.Panel>

                        <Tabs.Panel value="dark" pt="md">
                            {renderColorPanel(
                                form.values.darkColors || form.values.colors,
                                'darkColors',
                                '#25262b',
                            )}
                        </Tabs.Panel>
                    </Tabs>
                </Stack>
            </form>
        </MantineModal>
    );
};
