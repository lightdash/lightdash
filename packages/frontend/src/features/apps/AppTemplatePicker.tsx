import { type DataAppTemplate } from '@lightdash/common';
import { Stack, Text, ThemeIcon } from '@mantine-8/core';
import { IconCheck } from '@tabler/icons-react';
import { type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import classes from './AppTemplatePicker.module.css';
import { TEMPLATES } from './templates';

type Props = {
    selected: DataAppTemplate | null;
    onSelectedChange: (template: DataAppTemplate | null) => void;
};

const AppTemplatePicker: FC<Props> = ({ selected, onSelectedChange }) => (
    <div className={classes.fan}>
        {TEMPLATES.map((template, index) => {
            const Icon = template.icon;
            const isSelected = selected === template.id;
            return (
                <PolymorphicPaperButton
                    key={template.id}
                    component="button"
                    type="button"
                    radius="md"
                    className={`${classes.card} ${isSelected ? classes.cardSelected : ''}`}
                    data-pos={index}
                    aria-pressed={isSelected}
                    data-selected={isSelected ? 'true' : undefined}
                    onClick={() =>
                        onSelectedChange(isSelected ? null : template.id)
                    }
                >
                    <Stack gap="xs" align="flex-start">
                        <ThemeIcon
                            size="lg"
                            radius="md"
                            variant="light"
                            color="gray"
                            className={classes.cardIcon}
                        >
                            <Icon size={20} />
                        </ThemeIcon>
                        <Stack gap={4} className={classes.cardContent}>
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
                    </Stack>
                    {isSelected && (
                        <ThemeIcon
                            size={20}
                            radius="xl"
                            color="dark"
                            className={classes.selectedIndicator}
                        >
                            <IconCheck size={12} stroke={3} />
                        </ThemeIcon>
                    )}
                </PolymorphicPaperButton>
            );
        })}
    </div>
);

export default AppTemplatePicker;
