import { Box, Highlight, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import { useLocation } from 'react-router';
import { AiAgentIcon } from '../../ee/features/aiCopilot/components/AiAgentIcon';
import {
    type SettingsNavigationItem,
    type SettingsNavigationSection,
} from '../../hooks/settings/types';
import MantineIcon from '../common/MantineIcon';
import RouterNavLink from '../common/RouterNavLink';

type SettingsNavigationProps = {
    sections: SettingsNavigationSection[];
    searchQuery: string;
};

const SettingsNavigation: FC<SettingsNavigationProps> = ({
    sections,
    searchQuery,
}) => {
    const location = useLocation();
    const isFiltering = searchQuery.trim().length > 0;

    const renderItem = (item: SettingsNavigationItem) => {
        const leftSection = item.aiAgentIcon ? (
            <AiAgentIcon muted size={14} />
        ) : (
            <MantineIcon icon={item.icon} />
        );
        const label = isFiltering ? (
            <Highlight span inherit highlight={searchQuery}>
                {item.label}
            </Highlight>
        ) : (
            item.label
        );

        if (item.children.length === 0) {
            return (
                <RouterNavLink
                    key={item.to}
                    label={label}
                    to={item.to}
                    exact={item.exact}
                    onClick={item.onClick}
                    leftSection={leftSection}
                />
            );
        }

        return (
            <RouterNavLink
                key={item.to}
                label={label}
                to={item.to}
                exact={item.exact}
                onClick={item.onClick}
                leftSection={leftSection}
                defaultOpened={
                    isFiltering || location.pathname.includes(item.to)
                }
            >
                {item.children.map(renderItem)}
            </RouterNavLink>
        );
    };

    return (
        // Remount when filtering toggles: NavLink reads `defaultOpened` only on
        // mount, so this is what expands matching groups as you search.
        <Stack key={isFiltering ? 'filtered' : 'all'} gap="lg">
            {sections.map((section) => (
                <Box key={section.id}>
                    <Box mb="xs">
                        <Title order={6} fw={600}>
                            {section.title}
                        </Title>
                        {section.subtitle !== null && (
                            <Text fz="sm" fw={700} mt={2}>
                                {section.subtitle}
                            </Text>
                        )}
                    </Box>
                    {section.items.map(renderItem)}
                </Box>
            ))}
        </Stack>
    );
};

export default SettingsNavigation;
