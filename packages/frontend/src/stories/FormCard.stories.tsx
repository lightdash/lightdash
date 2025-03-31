import {
    Button,
    Card,
    SegmentedControl,
    Select,
    Stack,
    Switch,
    TextInput,
    Title,
} from '@mantine/core';
import type { Meta, StoryObj } from '@storybook/react';

interface FormCardProps {
    hasError?: boolean;
}

export function FormCard({ hasError = false }: FormCardProps) {
    const errorMessage = hasError ? 'This field is required' : undefined;

    return (
        <Card shadow="subtle" radius="md" p="lg">
            <Stack>
                <Title order={4}>This is a form card</Title>
                <Stack>
                    <TextInput
                        radius="md"
                        label="Name"
                        placeholder="Name"
                        error={errorMessage}
                    />
                    <TextInput
                        radius="md"
                        label="Email"
                        placeholder="Email"
                        error={errorMessage}
                    />
                    <TextInput
                        radius="md"
                        label="Phone"
                        placeholder="Phone"
                        error={errorMessage}
                    />
                    <Select
                        radius="md"
                        label="Login options"
                        placeholder="Select"
                        data={['Option 1', 'Option 2', 'Option 3']}
                        error={errorMessage}
                    />
                    <Switch label="Remember me" />
                    <SegmentedControl
                        radius="md"
                        data={['Option 1', 'Option 2', 'Option 3']}
                        sx={{
                            alignSelf: 'flex-start',
                        }}
                    />
                    <Button
                        type="submit"
                        radius="md"
                        variant="darkPrimary"
                        sx={{
                            alignSelf: 'flex-end',
                        }}
                    >
                        Submit
                    </Button>
                </Stack>
            </Stack>
        </Card>
    );
}

const meta: Meta<typeof FormCard> = {
    component: FormCard,
    argTypes: {
        hasError: {
            control: 'boolean',
            description: 'Toggle error state for all form inputs',
            defaultValue: false,
        },
    },
};

export default meta;
type Story = StoryObj<typeof FormCard>;

export const Primary: Story = {
    args: {
        hasError: false,
    },
};
