import { type DataAppTemplate } from '@lightdash/common';
import { Box, Group, Stack, Text } from '@mantine/core';
import { IconCircleCheckFilled } from '@tabler/icons-react';
import { type FC } from 'react';
import MantineIcon from '../../components/common/MantineIcon';
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
        {PICKER_TEMPLATES.map((template) => {
            const Icon = template.icon;
            const isSelected = selected === template.id;
            return (
                <PolymorphicPaperButton
                    key={template.id}
                    component="button"
                    type="button"
                    radius="md"
                    className={`${classes.card} ${isSelected ? classes.cardSelected : ''}`}
                    data-blank={template.id === 'custom' || undefined}
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
                    {isSelected && (
                        <MantineIcon
                            icon={IconCircleCheckFilled}
                            size={18}
                            className={classes.selectedMark}
                            aria-hidden
                        />
                    )}
                    <Box
                        className={classes.thumb}
                        data-layout={template.id}
                        aria-hidden
                    >
                        <Box component="span" />
                        <Box component="span" />
                        <Box component="span" />
                        <Box component="span" />
                    </Box>
                    <Stack gap={4} className={classes.cardContent}>
                        <Group gap={6} wrap="nowrap">
                            <MantineIcon
                                icon={Icon}
                                size={14}
                                className={classes.cardIcon}
                            />
                            <Text
                                fw={600}
                                size="sm"
                                className={classes.cardTitle}
                            >
                                {template.title}
                            </Text>
                        </Group>
                        <Text size="xs" className={classes.cardDescription}>
                            {template.description}
                        </Text>
                    </Stack>
                </PolymorphicPaperButton>
            );
        })}
    </div>
);

export default AppTemplatePicker;
