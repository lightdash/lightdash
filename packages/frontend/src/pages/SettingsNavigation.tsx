import { Box, Stack, Text, Title } from '@mantine-8/core';
import { type FC } from 'react';
import { useLocation } from 'react-router';
import MantineIcon from '../components/common/MantineIcon';
import RouterNavLink from '../components/common/RouterNavLink';
import {
    type SettingsNavigationItem,
    type SettingsNavigationSection,
} from '../hooks/settings/types';

type SettingsNavigationProps = {
    sections: SettingsNavigationSection[];
};

const SettingsNavigation: FC<SettingsNavigationProps> = ({ sections }) => {
    const location = useLocation();

    const renderItem = (item: SettingsNavigationItem) => {
        const leftSection = <MantineIcon icon={item.icon} />;

        if (item.children.length === 0) {
            return (
                <RouterNavLink
                    key={item.to}
                    label={item.label}
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
                label={item.label}
                to={item.to}
                exact={item.exact}
                onClick={item.onClick}
                leftSection={leftSection}
                defaultOpened={location.pathname.includes(item.to)}
            >
                {item.children.map(renderItem)}
            </RouterNavLink>
        );
    };

    return (
        <Stack gap="lg">
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
