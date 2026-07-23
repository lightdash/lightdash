import { Box, Group, Stack, Text, Title } from '@mantine-8/core';
import { type FC, type PropsWithChildren, type ReactNode } from 'react';
import classes from './SettingsPage.module.css';

type SettingsPageProps = {
    title: string;
    description?: ReactNode;
    actions?: ReactNode;
};

const SettingsPageContainer: FC<PropsWithChildren> = ({ children }) => (
    <Box className={classes.container}>{children}</Box>
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

export { SettingsPage, SettingsPageContainer };
