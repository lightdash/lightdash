import { Box, Switch, Text, Title } from '@mantine/core';
import { type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject, useUpdateDefaultUserSpaces } from '../../hooks/useProject';
import { SettingsGridCard } from '../common/Settings/SettingsCard';

export const DefaultUserSpaces: FC<{ projectUuid: string }> = ({
    projectUuid,
}) => {
    const { t } = useTranslation('spaces');
    const { data: project } = useProject(projectUuid);
    const { mutate, isLoading } = useUpdateDefaultUserSpaces(projectUuid);

    return (
        <SettingsGridCard>
            <Box>
                <Title order={5}>{t('defaultUserSpaces.title')}</Title>
                <Text c="dimmed" fz="xs">
                    {t('defaultUserSpaces.description')}
                </Text>
            </Box>
            <Box>
                <Switch
                    label={t('defaultUserSpaces.enable')}
                    checked={project?.hasDefaultUserSpaces ?? false}
                    disabled={isLoading}
                    onChange={(event) => {
                        mutate({
                            hasDefaultUserSpaces: event.currentTarget.checked,
                        });
                    }}
                />
            </Box>
        </SettingsGridCard>
    );
};
