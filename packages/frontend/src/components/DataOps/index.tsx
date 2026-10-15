import { ProjectType } from '@lightdash/common';
import { Button, Flex, Text, Title, Select } from '@mantine/core';
import { useState, type FC } from 'react';
import { useTranslation } from 'react-i18next';
import { useProject } from '../../hooks/useProject';
import { useProjects } from '../../hooks/useProjects';
import { groupComboboxItems } from '../common/Select/utils';
import { SettingsGridCard } from '../common/Settings/SettingsCard';
import { useUpdateMutation } from './hooks/useUpstreamProject';

export const DataOps: FC<{ projectUuid: string }> = ({ projectUuid }) => {
    const { t } = useTranslation('app');
    const { data: projects } = useProjects();
    const { data: currentProject } = useProject(projectUuid);
    const { mutateAsync: updateMutation } = useUpdateMutation(projectUuid);
    const [selectedProject, setSelectedProject] = useState<string | null>(
        currentProject?.upstreamProjectUuid || null,
    );
    return (
        <>
            <Text c="dimmed">{t('dataOps.description')}</Text>

            <SettingsGridCard>
                <div>
                    <Title order={5}>{t('dataOps.promoteTitle')}</Title>
                    <Text c="dimmed" fz="xs">
                        {t('dataOps.promoteDescription')}
                    </Text>
                </div>
                <div>
                    <Select
                        value={selectedProject}
                        clearable
                        data={groupComboboxItems(
                            projects
                                ?.sort((a, b) => {
                                    if (a.type === b.type) {
                                        return 0;
                                    }
                                    return a.type === ProjectType.PREVIEW
                                        ? 1
                                        : -1;
                                })
                                .map((project) => ({
                                    label:
                                        project.projectUuid === projectUuid
                                            ? t('dataOps.currentProject', {
                                                  name: project.name,
                                              })
                                            : project.name,
                                    value: project.projectUuid,
                                    disabled:
                                        project.projectUuid === projectUuid,
                                    group:
                                        project.type === ProjectType.PREVIEW
                                            ? t('dataOps.previewProjects')
                                            : t('dataOps.productionProjects'),
                                })) || [],
                        )}
                        label={t('dataOps.upstreamProject')}
                        onChange={(value) => {
                            setSelectedProject(value || null);
                        }}
                        placeholder={t('dataOps.selectProject')}
                    />
                    <Flex justify="flex-end" gap="sm" mt="sm">
                        <Button
                            type="submit"
                            display="block"
                            disabled={
                                selectedProject ===
                                currentProject?.upstreamProjectUuid
                            }
                            onClick={async () => {
                                await updateMutation({
                                    upstreamProjectUuid: selectedProject,
                                });
                            }}
                        >
                            {t('actions.update', { ns: 'common' })}
                        </Button>
                    </Flex>
                </div>
            </SettingsGridCard>
        </>
    );
};
