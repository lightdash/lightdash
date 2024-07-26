import { ActionIcon, Divider, Group, Stack, Title } from '@mantine/core';
import { IconChevronDown, IconChevronRight } from '@tabler/icons-react';
import { useState } from 'react';
import MantineIcon from '../../../components/common/MantineIcon';
import { BarChartStyling } from './visualizations/BarChartStyling';

export const BarChartConfig = () => {
    const [isFieldConfigurationOpen, setIsFieldConfigurationOpen] =
        useState(true);
    const [isStylingOpen, setIsStylingOpen] = useState(false);
    return (
        <Stack spacing="xs" mb="lg">
            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    Data
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() =>
                            setIsFieldConfigurationOpen(
                                !isFieldConfigurationOpen,
                            )
                        }
                        icon={
                            isFieldConfigurationOpen
                                ? IconChevronDown
                                : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isFieldConfigurationOpen && <BarChartFieldConfiguration />}

            <Divider />

            <Group spacing="xs">
                <Title order={5} fz="sm" c="gray.9">
                    Styling
                </Title>
                <ActionIcon>
                    <MantineIcon
                        onClick={() => setIsStylingOpen(!isStylingOpen)}
                        icon={
                            isStylingOpen ? IconChevronDown : IconChevronRight
                        }
                    />
                </ActionIcon>
            </Group>

            {isStylingOpen && <BarChartStyling />}
        </Stack>
    );
};
