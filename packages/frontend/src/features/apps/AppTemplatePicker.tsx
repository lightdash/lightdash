import { type DataAppTemplate } from '@lightdash/common';
import { Stack, Text, ThemeIcon } from '@mantine/core';
import { type FC } from 'react';
import { PolymorphicPaperButton } from '../../components/common/PolymorphicPaperButton';
import classes from './AppTemplatePicker.module.css';
import { PICKER_TEMPLATES } from './templates';

type Props = {
    selected: DataAppTemplate | null;
    onSelectedChange: (template: DataAppTemplate | null) => void;
};

/**
 * Walkthrough action for create:DataApp: picking a template is the first
 * decision of a new app. The build itself is an AI job that spends credit,
 * so the walkthrough stops at Send and then opens the seeded app to show
 * what a finished one looks like. See scripts/scope-tours.
 */
const createAppTourAction = {
    'data-tour-scope': 'create:DataApp',
    'data-tour-step': '2',
    'data-tour-route': '/projects/:projectUuid/apps/generate',
    'data-tour-label': 'Choose the Dashboard template',
    'data-tour-title': 'Create a data app',
    'data-tour-interactive': 'true',
    'data-tour-via': '[data-tour-nav="new"] >> [data-tour-nav="new-app"]',
    'data-tour-then':
        '[data-tour-anchor="app-prompt"] >> [data-tour-nav="browse"] >> [data-tour-nav="all-apps"] >> [data-tour-anchor="app-row"][data-tour-value="Jaffle pulse"] >> [data-tour-anchor="app-continue-building"]',
    'data-tour-docs': 'data-apps.mdx#choosing-a-template:p2:1',
};

const AppTemplatePicker: FC<Props> = ({ selected, onSelectedChange }) => (
    <div
        className={classes.fan}
        // Walkthrough look: the four starting points, before one is picked.
        data-tour-scope="create:DataApp"
        data-tour-look="1"
        data-tour-after='[data-tour-nav="new-app"]'
        data-tour-label="Every app starts from a template"
        data-tour-docs="data-apps.mdx#choosing-a-template:1"
    >
        {PICKER_TEMPLATES.map((template, index) => {
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
                    // Anchor for scope walkthroughs, one card by its title:
                    // [data-tour-anchor="app-template"][data-tour-value="Dashboard"]
                    // data-tour-hint="Choose the {value} template"
                    data-tour-anchor="app-template"
                    data-tour-value={template.title}
                    {...(template.title === 'Dashboard'
                        ? createAppTourAction
                        : {})}
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
                </PolymorphicPaperButton>
            );
        })}
    </div>
);

export default AppTemplatePicker;
