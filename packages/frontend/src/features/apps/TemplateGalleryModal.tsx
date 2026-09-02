import { type DataAppTemplateSummary } from '@lightdash/common';
import {
    Badge,
    Group,
    Modal,
    Paper,
    SimpleGrid,
    Stack,
    Text,
    ThemeIcon,
} from '@mantine/core';
import { IconTemplate } from '@tabler/icons-react';
import { type FC } from 'react';

type Props = {
    opened: boolean;
    onClose: () => void;
    templates: DataAppTemplateSummary[];
    selectedSlug: string | null;
    onSelect: (template: DataAppTemplateSummary) => void;
};

/**
 * The gallery behind the picker's "From Template" card: the organization's
 * uploaded templates, in a grid that scales as the set grows. Selecting a
 * card hands the template back to the picker's selection.
 */
const TemplateGalleryModal: FC<Props> = ({
    opened,
    onClose,
    templates,
    selectedSlug,
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
                const isSelected = selectedSlug === template.slug;
                return (
                    <Paper
                        key={template.slug}
                        component="button"
                        type="button"
                        withBorder
                        radius="md"
                        p="md"
                        aria-pressed={isSelected}
                        onClick={() => onSelect(template)}
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
                                <IconTemplate size={20} />
                            </ThemeIcon>
                            <Stack gap={4}>
                                <Text fw={600} size="sm">
                                    {template.name}
                                </Text>
                                <Group gap={4}>
                                    <Badge
                                        size="xs"
                                        variant="light"
                                        color="gray"
                                    >
                                        {template.category}
                                    </Badge>
                                    <Badge
                                        size="xs"
                                        variant="outline"
                                        color={
                                            template.kind === 'seeded'
                                                ? 'teal'
                                                : 'grape'
                                        }
                                        title={
                                            template.kind === 'seeded'
                                                ? "Seeded: the app is built from the template's own source and bound to your data"
                                                : "Prompt: the app is generated from the template author's instructions"
                                        }
                                    >
                                        {template.kind === 'seeded'
                                            ? 'Seeded'
                                            : 'Prompt'}
                                    </Badge>
                                </Group>
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
