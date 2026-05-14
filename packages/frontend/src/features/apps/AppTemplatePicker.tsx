import { type DataAppTemplate } from '@lightdash/common';
import { Group, SimpleGrid, Stack, Text, ThemeIcon } from '@mantine-8/core';
import { type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import classes from './AppTemplatePicker.module.css';
import { TEMPLATES } from './templates';

type Props = {
    onSelect: (template: DataAppTemplate) => void;
};

const AppTemplatePicker: FC<Props> = ({ onSelect }) => (
    <div className={classes.wrapper}>
        <Stack gap={4} className={classes.heading}>
            <Text fw={600} size="lg">
                Build a data app
            </Text>
            <Text size="sm" c="dimmed">
                Pick a starting point - you can customize the prompt before
                generating.
            </Text>
        </Stack>
        <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
            {TEMPLATES.map((template) => {
                const Icon = template.icon;
                return (
                    <PolymorphicPaperButton
                        key={template.id}
                        component="button"
                        type="button"
                        className={classes.card}
                        onClick={() => onSelect(template.id)}
                        radius="md"
                    >
                        <Group gap="sm" wrap="nowrap" align="flex-start">
                            <ThemeIcon
                                size="lg"
                                radius="md"
                                variant="light"
                                color="gray"
                                className={classes.cardIcon}
                            >
                                <Icon size={20} />
                            </ThemeIcon>
                            <Stack gap={2}>
                                <Text
                                    fw={600}
                                    size="sm"
                                    className={classes.cardTitle}
                                >
                                    {template.title}
                                </Text>
                                <Text size="xs" c="dimmed">
                                    {template.description}
                                </Text>
                            </Stack>
                        </Group>
                    </PolymorphicPaperButton>
                );
            })}
        </SimpleGrid>
    </div>
);

export default AppTemplatePicker;
