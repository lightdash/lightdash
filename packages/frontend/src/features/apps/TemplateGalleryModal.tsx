import { type DataAppTemplate } from '@lightdash/common';
import {
    Badge,
    Modal,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import { type FC } from 'react';
import { type TemplateDefinition } from './templates';

type Props = {
    opened: boolean;
    onClose: () => void;
    templates: TemplateDefinition[];
    selected: DataAppTemplate | null;
    onSelect: (templateId: DataAppTemplate) => void;
};

/**
 * The gallery behind the picker's "From Template" card: every registry
 * template surfaced with `inGallery`, in a grid that scales as the set grows.
 * Selecting a card hands the template id back to the picker's selection.
 */
const TemplateGalleryModal: FC<Props> = ({
    opened,
    onClose,
    templates,
    selected,
    onSelect,
}) => (
    <Modal
        opened={opened}
        onClose={onClose}
        title="Template gallery"
        size="xl"
        centered
    >
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
            {templates.map((template) => {
                const Icon = template.icon;
                const isSelected = selected === template.id;
                return (
                    <Paper
                        key={template.id}
                        component="button"
                        type="button"
                        withBorder
                        radius="md"
                        p="md"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(template.id)}
                        style={{
                            cursor: 'pointer',
                            textAlign: 'left',
                            font: 'inherit',
                            boxShadow: isSelected
                                ? '0 0 0 2px var(--mantine-primary-color-filled)'
                                : undefined,
                        }}
                    >
                        <Stack gap="xs" align="flex-start">
                            <ThemeIcon
                                size="lg"
                                radius="md"
                                variant="light"
                                color="gray"
                            >
                                <Icon size={20} />
                            </ThemeIcon>
                            <Stack gap={4}>
                                <Text fw={600} size="sm">
                                    {template.title}
                                </Text>
                                <Badge size="xs" variant="light" color="gray">
                                    {template.category}
                                </Badge>
                                <Text size="xs" c="dimmed" lineClamp={3}>
                                    {template.description}
                                </Text>
                            </Stack>
                        </Stack>
                    </Paper>
                );
            })}
        </SimpleGrid>
    </Modal>
);

export default TemplateGalleryModal;
