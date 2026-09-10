import {
    Checkbox,
    Fieldset,
    Group,
    MultiSelect,
    NativeSelect,
    NumberInput,
    PasswordInput,
    Radio,
    Select,
    SimpleGrid,
    Stack,
    Switch,
    TagsInput,
    Text,
    Textarea,
    TextInput,
    Title,
} from '@mantine/core';
import { DateInput, DatePicker, TimeInput } from '@mantine/dates';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { IconSearch } from '@tabler/icons-react';
import type { FC, ReactNode } from 'react';
import MantineIcon from '../../components/common/MantineIcon';

/**
 * Static render of every input-based component. Input.module.css applies to
 * all of them through the shared Input primitive and keys on
 * data-variant / data-error / data-disabled; Checkbox, Radio and Switch key
 * on data-size.
 */
const meta: Meta = {
    title: 'Mantine baseline/Inputs',
    parameters: { layout: 'padded' },
};

export default meta;

const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;

const Section: FC<{ title: string; children: ReactNode }> = ({
    title,
    children,
}) => (
    <Stack gap="xs">
        <Title order={5}>{title}</Title>
        {children}
    </Stack>
);

const SELECT_DATA = [
    { group: 'Dimensions', items: ['Order date', 'Customer name', 'Status'] },
    {
        group: 'Metrics',
        items: [
            'Total revenue',
            { value: 'disabled', label: 'Disabled option', disabled: true },
        ],
    },
];

export const TextInputs: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section title="States (variant=default)">
                <SimpleGrid cols={2}>
                    <TextInput
                        label="Label"
                        description="Description text"
                        placeholder="Placeholder"
                    />
                    <TextInput
                        label="Required"
                        required
                        withAsterisk
                        defaultValue="Value"
                    />
                    <TextInput
                        label="Error"
                        error="Something is wrong"
                        defaultValue="Value"
                    />
                    <TextInput label="Disabled" disabled defaultValue="Value" />
                    <TextInput
                        label="With sections"
                        leftSection={<MantineIcon icon={IconSearch} />}
                        rightSection={<Text size="xs">⌘K</Text>}
                        placeholder="Search"
                    />
                    <TextInput
                        label="Autofocus (focus ring)"
                        placeholder="Focused"
                        autoFocus
                    />
                </SimpleGrid>
            </Section>
            <Section title="variant=subtle (transparent until hover/focus)">
                <SimpleGrid cols={2}>
                    <TextInput variant="subtle" placeholder="Subtle" />
                    <TextInput
                        variant="subtle"
                        error
                        defaultValue="Subtle with error"
                    />
                    <TextInput
                        variant="subtle"
                        disabled
                        defaultValue="Subtle disabled"
                    />
                    <TextInput variant="filled" placeholder="variant=filled" />
                </SimpleGrid>
            </Section>
            <Section title="Sizes (28 / 32 / 36 / 40 / 44px, font stays sm until lg)">
                <Stack gap="xs">
                    {SIZES.map((size) => (
                        <TextInput
                            key={size}
                            size={size}
                            placeholder={`size=${size}`}
                            leftSection={<MantineIcon icon={IconSearch} />}
                        />
                    ))}
                </Stack>
            </Section>
            <Section title="Other Input-based components">
                <SimpleGrid cols={2}>
                    <PasswordInput
                        label="PasswordInput (theme forces size=sm)"
                        defaultValue="hunter2"
                    />
                    <NumberInput label="NumberInput" defaultValue={42} />
                    <Textarea
                        label="Textarea"
                        placeholder="Multi-line"
                        autosize
                        minRows={2}
                    />
                    <NativeSelect
                        label="NativeSelect"
                        data={['One', 'Two', 'Three']}
                    />
                </SimpleGrid>
            </Section>
        </Stack>
    ),
};

export const Selects: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section title="Select with the dropdown held open (Combobox.module.css)">
                <Group align="flex-start" grow>
                    <Select
                        label="Select"
                        data={SELECT_DATA}
                        defaultValue="Order date"
                        dropdownOpened
                        comboboxProps={{ withinPortal: false }}
                        searchable
                        nothingFoundMessage="Nothing found"
                    />
                    <Select
                        label="Empty state"
                        data={[]}
                        dropdownOpened
                        comboboxProps={{ withinPortal: false }}
                        nothingFoundMessage="No fields match"
                        placeholder="Type to search"
                    />
                </Group>
            </Section>
            <Section title="MultiSelect and TagsInput (Pill inside Input)">
                <SimpleGrid cols={2} pt={260}>
                    <MultiSelect
                        label="MultiSelect"
                        data={SELECT_DATA}
                        defaultValue={['Order date', 'Total revenue']}
                    />
                    <TagsInput
                        label="TagsInput"
                        defaultValue={['finance', 'weekly']}
                    />
                    <MultiSelect
                        label="Disabled"
                        data={SELECT_DATA}
                        defaultValue={['Order date']}
                        disabled
                    />
                    <MultiSelect
                        label="Error"
                        data={SELECT_DATA}
                        defaultValue={['Order date']}
                        error="Pick at least two"
                    />
                </SimpleGrid>
            </Section>
        </Stack>
    ),
};

export const ChecksAndSwitches: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section title="Checkbox (data-size=xs gets the secondary label)">
                {SIZES.map((size) => (
                    <Group key={size} gap="xl">
                        <Checkbox size={size} label={`size=${size}`} />
                        <Checkbox size={size} label="Checked" defaultChecked />
                        <Checkbox
                            size={size}
                            label="Indeterminate"
                            indeterminate
                        />
                        <Checkbox size={size} label="Disabled" disabled />
                        <Checkbox
                            size={size}
                            label="Description"
                            description="Helper text"
                        />
                    </Group>
                ))}
            </Section>
            <Section title="Radio (shares Checkbox.module.css)">
                <Radio.Group defaultValue="b" label="Radio group">
                    <Group gap="xl" mt="xs">
                        <Radio value="a" label="Option A" />
                        <Radio value="b" label="Option B" />
                        <Radio value="c" label="Disabled" disabled />
                        <Radio
                            value="d"
                            label="Description"
                            description="Helper text"
                        />
                    </Group>
                </Radio.Group>
                <Group gap="xl">
                    <Radio size="xs" label="size=xs" defaultChecked />
                    <Radio size="xs" label="size=xs" />
                </Group>
            </Section>
            <Section title="Switch">
                {SIZES.map((size) => (
                    <Group key={size} gap="xl">
                        <Switch size={size} label={`size=${size}`} />
                        <Switch size={size} label="On" defaultChecked />
                        <Switch size={size} label="Disabled" disabled />
                        <Switch
                            size={size}
                            label="Description"
                            description="Helper text"
                        />
                    </Group>
                ))}
            </Section>
            <Section title="Fieldset (radius lg)">
                <Fieldset legend="Connection">
                    <TextInput label="Host" placeholder="localhost" />
                    <TextInput label="Port" placeholder="5432" mt="sm" />
                </Fieldset>
            </Section>
        </Stack>
    ),
};

export const Dates: StoryObj = {
    render: () => (
        <Stack gap="xl" maw={720}>
            <Section title="DatePicker range (data-selected / data-in-range)">
                <Group align="flex-start">
                    <DatePicker
                        type="range"
                        value={[new Date(2026, 8, 3), new Date(2026, 8, 18)]}
                        defaultDate={new Date(2026, 8, 1)}
                    />
                    <DatePicker
                        type="range"
                        numberOfColumns={2}
                        value={[new Date(2026, 7, 20), new Date(2026, 8, 5)]}
                        defaultDate={new Date(2026, 7, 1)}
                    />
                </Group>
            </Section>
            <Section title="Year and decade levels">
                <Group align="flex-start">
                    <DatePicker
                        defaultLevel="year"
                        defaultDate={new Date(2026, 8, 1)}
                        value={new Date(2026, 8, 3)}
                    />
                    <DatePicker
                        defaultLevel="decade"
                        defaultDate={new Date(2026, 8, 1)}
                        value={new Date(2026, 8, 3)}
                    />
                </Group>
            </Section>
            <Section title="Inputs">
                <SimpleGrid cols={2}>
                    <DateInput
                        label="DateInput"
                        value={new Date(2026, 8, 3)}
                        valueFormat="YYYY-MM-DD"
                    />
                    <TimeInput label="TimeInput" defaultValue="09:30" />
                </SimpleGrid>
            </Section>
        </Stack>
    ),
};
