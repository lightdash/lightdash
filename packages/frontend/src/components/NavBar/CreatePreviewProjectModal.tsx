import { subject } from '@casl/ability';
import { ProjectType } from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Group,
    MantineProvider,
    Modal,
    Select,
    Stack,
    Text,
    TextInput,
    Tooltip,
} from '@mantine/core';
import { IconExternalLink, IconRefresh } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useCreatePreviewMutation } from '../../hooks/useProjectPreview';
import { useProjects } from '../../hooks/useProjects';
import { useApp } from '../../providers/AppProvider';
import MantineIcon from '../common/MantineIcon';

type Props = {
    isOpened: boolean;
    onClose: () => void;
};

const CreatePreviewModal: FC<Props> = ({ isOpened, onClose }) => {
    const { user } = useApp();

    const { isInitialLoading: isLoadingProjects, data: projects } =
        useProjects();
    const { isLoading: isLoadingActiveProjectUuid, activeProjectUuid } =
        useActiveProjectUuid();
    const { mutateAsync: createPreviewProject, isLoading: isPreviewCreating } =
        useCreatePreviewMutation();

    const [selectedProjectUuid, setSelectedProjectUuid] = useState<string>();
    const [previewName, setPreviewName] = useState('');

    const handleGeneratePreviewName = useCallback(() => {
        return uniqueNamesGenerator({
            length: 2,
            separator: ' ',
            dictionaries: [colors, animals],
        });
    }, []);

    const handleSelectProject = useCallback(
        (value: string) => {
            setPreviewName(handleGeneratePreviewName());
            setSelectedProjectUuid(value);
        },
        [handleGeneratePreviewName],
    );

    const regularProjectList = useMemo(() => {
        if (isLoadingProjects || !projects || !user.data) return [];

        return projects
            .filter((p) => p.type === ProjectType.DEFAULT)
            .map((project) => {
                const userCannotCreatePreview = user.data.ability.cannot(
                    'create',
                    subject('Project', {
                        organizationUuid: user.data.organizationUuid,
                        upstreamProjectUuid: project.projectUuid,
                        type: ProjectType.PREVIEW,
                    }),
                );

                return {
                    value: project.projectUuid,
                    label: project.name,
                    group: userCannotCreatePreview
                        ? 'Requires Developer Access'
                        : undefined,
                    disabled: userCannotCreatePreview,
                };
            })
            .sort((a, b) =>
                a.disabled === b.disabled ? 0 : a.disabled ? 1 : -1,
            );
    }, [isLoadingProjects, projects, user.data]);

    const selectedProject = useMemo(() => {
        if (selectedProjectUuid && projects) {
            return projects.find(
                (project) => project.projectUuid === selectedProjectUuid,
            );
        }
    }, [projects, selectedProjectUuid]);

    useEffect(() => {
        if (
            !isLoadingActiveProjectUuid &&
            activeProjectUuid &&
            !selectedProjectUuid &&
            projects
        ) {
            const activeProjectValue = regularProjectList.find(
                (project) => project.value === activeProjectUuid,
            );

            if (activeProjectValue && !activeProjectValue.disabled) {
                setSelectedProjectUuid(activeProjectUuid);
                setPreviewName(handleGeneratePreviewName());
            }
        }
    }, [
        activeProjectUuid,
        handleGeneratePreviewName,
        isLoadingActiveProjectUuid,
        projects,
        regularProjectList,
        selectedProjectUuid,
    ]);

    const handleCreatePreview = useCallback(async () => {
        if (!selectedProjectUuid || !previewName) return;

        await createPreviewProject({
            projectUuid: selectedProjectUuid,
            name: previewName,
        });
        onClose();
    }, [createPreviewProject, onClose, previewName, selectedProjectUuid]);

    return (
        <MantineProvider inherit theme={{ colorScheme: 'light' }}>
            <Modal
                size="lg"
                opened={isOpened}
                onClose={() => onClose()}
                title={
                    <Text fw={500}>
                        Create a preview project
                        {selectedProject ? (
                            <Text span>
                                {' '}
                                from{' '}
                                <Text span fw={600}>
                                    {selectedProject.name}
                                </Text>
                            </Text>
                        ) : (
                            ''
                        )}
                    </Text>
                }
            >
                <Stack>
                    <Stack spacing="sm">
                        <div>
                            <Text>
                                This will create a preview project
                                {selectedProject ? (
                                    <Text span>
                                        {' '}
                                        from{' '}
                                        <Text span fw={500}>
                                            {selectedProject.name}
                                        </Text>
                                    </Text>
                                ) : null}
                            </Text>

                            <Anchor
                                href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview/"
                                target="_blank"
                            >
                                Learn more about preview projects{' '}
                                <MantineIcon
                                    size="sm"
                                    icon={IconExternalLink}
                                    display="inline-block"
                                />
                            </Anchor>
                        </div>

                        <Select
                            withinPortal
                            label="Project"
                            placeholder="Select project"
                            searchable
                            value={selectedProjectUuid}
                            disabled={
                                isLoadingActiveProjectUuid || isLoadingProjects
                            }
                            data={regularProjectList}
                            onChange={(value) => {
                                if (value) handleSelectProject(value);
                            }}
                        />

                        <TextInput
                            label="Preview name"
                            placeholder="Enter preview name"
                            value={previewName}
                            disabled={isPreviewCreating}
                            onChange={(e) => {
                                setPreviewName(e.currentTarget.value);
                            }}
                            rightSection={
                                <Tooltip
                                    withinPortal
                                    label="Generate unique name"
                                >
                                    <ActionIcon
                                        onClick={() =>
                                            setPreviewName(
                                                handleGeneratePreviewName(),
                                            )
                                        }
                                    >
                                        <MantineIcon icon={IconRefresh} />
                                    </ActionIcon>
                                </Tooltip>
                            }
                        />
                    </Stack>

                    <Group position="right">
                        <Button variant="outline" onClick={onClose}>
                            Cancel
                        </Button>

                        <Button
                            disabled={
                                isPreviewCreating ||
                                !selectedProjectUuid ||
                                !previewName
                            }
                            loading={isPreviewCreating}
                            onClick={handleCreatePreview}
                        >
                            {isPreviewCreating
                                ? 'Creating preview'
                                : 'Create preview'}
                        </Button>
                    </Group>
                </Stack>
            </Modal>
        </MantineProvider>
    );
};

export { CreatePreviewModal };
