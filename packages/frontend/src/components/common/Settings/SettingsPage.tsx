import { Box, Button, Group, Stack, Text, Title } from '@mantine-8/core';
import { IconExternalLink } from '@tabler/icons-react';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import MantineIcon from '../MantineIcon';
import classes from './SettingsPage.module.css';

type SettingsPageProps = {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
};

const SettingsPageContainer: FC<PropsWithChildren> = ({ children }) => (
    <Box className={classes.container}>{children}</Box>
);

const SettingsPageActions: FC<PropsWithChildren> = ({ children }) => (
    <Group gap="xs" wrap="nowrap">
        {children}
    </Group>
);

const SettingsPageDocumentationLink: FC<{
    href: string;
    label?: string;
}> = ({ href, label = 'Documentation' }) => (
    <Button
        component="a"
        href={href}
        target="_blank"
        rel="noreferrer"
        variant="default"
        size="xs"
        rightSection={<MantineIcon icon={IconExternalLink} size="sm" />}
    >
        {label}
    </Button>
);

const SettingsPage: FC<PropsWithChildren<SettingsPageProps>> = ({
    title,
    description,
    actions,
    children,
}) => (
    <Stack gap="lg" className={classes.page}>
        <SettingsPageContainer>
            <Group
                justify="space-between"
                align="flex-start"
                wrap="nowrap"
                gap="lg"
                className={classes.header}
            >
                <Stack gap={4} className={classes.heading}>
                    <Title order={4} className={classes.title}>
                        {title}
                    </Title>
                    {description ? (
                        <Text
                            fz="sm"
                            c="ldGray.6"
                            className={classes.description}
                        >
                            {description}
                        </Text>
                    ) : null}
                </Stack>
                {actions ? (
                    <Box className={classes.actions}>{actions}</Box>
                ) : null}
            </Group>
        </SettingsPageContainer>

        <Stack gap="lg" className={classes.content}>
            {children}
        </Stack>
    </Stack>
);

export {
    SettingsPage,
    SettingsPageActions,
    SettingsPageContainer,
    SettingsPageDocumentationLink,
};
