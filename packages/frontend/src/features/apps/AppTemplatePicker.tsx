import { type DataAppTemplate } from '@lightdash/common';
import {
    Button,
    Group,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine-8/core';
import { useState, type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import { ThemePicker } from '../organizationDesigns/components/ThemePicker';
import classes from './AppTemplatePicker.module.css';
import { TEMPLATES } from './templates';

type Props = {
    onSelect: (template: DataAppTemplate) => void;
    /**
     * Theme (org design) selection — picked at the same moment as the
     * template. The picker is inlined here so users see both the structural
     * starting point and the brand context in one step.
     */
    selectedThemeUuid: string | null;
    onThemeChange: (designUuid: string | null) => void;
};

const AppTemplatePicker: FC<Props> = ({
    onSelect,
    selectedThemeUuid,
    onThemeChange,
}) => {
    // Highlighted-but-not-yet-confirmed template. The picker owns this state
    // because clicking a card no longer advances the wizard — the user
    // confirms with the "Let's go!" button after also picking a theme.
    const [highlighted, setHighlighted] = useState<DataAppTemplate | null>(
        null,
    );

    return (
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
            <SimpleGrid
                type="container"
                cols={{ base: 1, '340px': 2 }}
                spacing="sm"
            >
                {TEMPLATES.map((template) => {
                    const Icon = template.icon;
                    const isSelected = highlighted === template.id;
                    return (
                        <PolymorphicPaperButton
                            key={template.id}
                            component="button"
                            type="button"
                            className={`${classes.card} ${
                                isSelected ? classes.cardSelected : ''
                            }`}
                            onClick={() => setHighlighted(template.id)}
                            radius="md"
                            aria-pressed={isSelected}
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
            <Stack gap={4} className={classes.heading}>
                <Text fw={600} size="lg" mt="lg">
                    Choose a theme
                </Text>
                <Text size="sm" c="dimmed">
                    Your app will follow the design guidelines defined in your
                    theme.
                </Text>
            </Stack>
            <Group justify="center">
                <ThemePicker
                    value={selectedThemeUuid}
                    onChange={onThemeChange}
                />
            </Group>
            <Group justify="flex-end" mt="xl">
                <Button
                    size="md"
                    disabled={highlighted === null}
                    onClick={() => {
                        if (highlighted !== null) onSelect(highlighted);
                    }}
                >
                    Let's go!
                </Button>
            </Group>
        </div>
    );
};

export default AppTemplatePicker;
