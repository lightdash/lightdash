import { subject } from '@casl/ability';
import {
    DbtProjectType,
    DbtProjectTypeLabels,
    ProjectType,
    type ApiError,
    type DbtProjectEnvironmentVariable,
} from '@lightdash/common';
import {
    ActionIcon,
    Anchor,
    Button,
    Flex,
    Group,
    Input,
    Loader,
    Select,
    Stack,
    Text,
    Textarea,
    TextInput,
    Tooltip,
} from '@mantine-8/core';
import {
    IconExternalLink,
    IconHelpCircle,
    IconPlus,
    IconRefresh,
    IconTrash,
} from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import React, {
    useCallback,
    useEffect,
    useMemo,
    useState,
    type FC,
} from 'react';
import { animals, colors, uniqueNamesGenerator } from 'unique-names-generator';
import { lightdashApi } from '../../api';
import { useActiveProjectUuid } from '../../hooks/useActiveProject';
import { useProject } from '../../hooks/useProject';
import { useCreatePreviewMutation } from '../../hooks/useProjectPreview';
import { useProjects } from '../../hooks/useProjects';
import useApp from '../../providers/App/useApp';
import MantineIcon from '../common/MantineIcon';
import MantineModal from '../common/MantineModal';
import DocumentationHelpButton from '../DocumentationHelpButton';
import FormCollapseButton from '../ProjectConnection/FormCollapseButton';

const getProjectGitBranches = async (projectUuid: string) =>
    lightdashApi<string[]>({
        url: `/projects/${projectUuid}/git-integration/branches`,
        method: 'GET',
        body: undefined,
    });

const useBranches = (projectUuid?: string) => {
    return useQuery<string[], ApiError>({
        enabled: !!projectUuid,
        queryKey: ['project_git_branches', projectUuid],
        queryFn: () => getProjectGitBranches(projectUuid!),
        retry: false,
    });
};

type EnvironmentVariablesInputProps = {
    value: DbtProjectEnvironmentVariable[];
    onChange: (value: DbtProjectEnvironmentVariable[]) => void;
    label: string;
    disabled?: boolean;
    documentationUrl?: string;
    labelHelp?: string | React.ReactNode;
};

const EnvironmentVariablesInput: FC<EnvironmentVariablesInputProps> = ({
    value,
    onChange,
    label,
    disabled,
    documentationUrl,
    labelHelp,
}) => {
    const [isLabelInfoOpen, setIsLabelInfoOpen] = useState<boolean>(false);

    const handleAddVariable = () => {
        onChange([...value, { key: '', value: '' }]);
    };

    const handleRemoveVariable = (index: number) => {
        const newVariables = [...value];
        newVariables.splice(index, 1);
        onChange(newVariables);
    };

    const handleUpdateVariable = (
        index: number,
        field: 'key' | 'value',
        newValue: string,
    ) => {
        const newVariables = [...value];
        newVariables[index] = {
            ...newVariables[index],
            [field]: newValue,
        };
        onChange(newVariables);
    };

    return (
        <Input.Wrapper
            styles={{
                label: {
                    display: 'flex',
                    alignItems: 'center',
                },
            }}
            label={
                <>
                    {label}
                    <div style={{ flex: 1 }}></div>
                    {documentationUrl && !labelHelp && (
                        <DocumentationHelpButton href={documentationUrl} />
                    )}
                    {labelHelp && (
                        <ActionIcon
                            onClick={(
                                e: React.MouseEvent<HTMLButtonElement>,
                            ) => {
                                e.preventDefault();
                                setIsLabelInfoOpen(!isLabelInfoOpen);
                            }}
                        >
                            <MantineIcon icon={IconHelpCircle} />
                        </ActionIcon>
                    )}
                </>
            }
            description={isLabelInfoOpen && labelHelp}
        >
            <Stack>
                {value.map((variable, index) => (
                    <Flex key={index} gap="xs" align="center">
                        <TextInput
                            value={variable.key}
                            onChange={(e) =>
                                handleUpdateVariable(
                                    index,
                                    'key',
                                    e.target.value,
                                )
                            }
                            placeholder="Key"
                            disabled={disabled}
                        />

                        <TextInput
                            value={variable.value}
                            onChange={(e) =>
                                handleUpdateVariable(
                                    index,
                                    'value',
                                    e.target.value,
                                )
                            }
                            placeholder="Value"
                            disabled={disabled}
                        />

                        <ActionIcon
                            onClick={() => handleRemoveVariable(index)}
                            disabled={disabled}
                        >
                            <MantineIcon icon={IconTrash} />
                        </ActionIcon>
                    </Flex>
                ))}

                <Button
                    size="sm"
                    onClick={handleAddVariable}
                    leftSection={<MantineIcon icon={IconPlus} />}
                    disabled={disabled}
                    variant="outline"
                >
                    Add variable
                </Button>
            </Stack>
        </Input.Wrapper>
    );
};

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

    const [isOpen, setIsOpen] = useState(false);
    const [selectedProjectUuid, setSelectedProjectUuid] = useState<
        string | null
    >(null);
    const [previewName, setPreviewName] = useState('');
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [schema, setSchema] = useState<string>();
    const [environment, setEnvironment] = useState<
        DbtProjectEnvironmentVariable[]
    >([]);
    const [manifestJson, setManifestJson] = useState<string>('');
    const [manifestError, setManifestError] = useState<string>('');

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

                const item: {
                    value: string;
                    label: string;
                    disabled: boolean;
                    group?: string;
                } = {
                    value: project.projectUuid,
                    label: project.name,
                    disabled: userCannotCreatePreview,
                };

                if (userCannotCreatePreview) {
                    item.group = 'Requires Developer Access';
                }

                return item;
            })
            .sort((a, b) =>
                a.disabled === b.disabled ? 0 : a.disabled ? 1 : -1,
            );
    }, [isLoadingProjects, projects, user.data]);

    const { data: projectDetails } = useProject(
        selectedProjectUuid ?? undefined,
    );
    const hasGitIntegration = useMemo(() => {
        return [DbtProjectType.GITHUB, DbtProjectType.GITLAB].includes(
            projectDetails?.dbtConnection?.type as DbtProjectType,
        );
    }, [projectDetails?.dbtConnection?.type]);

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

    const reduceManifest = useCallback((manifestString: string): string => {
        try {
            const parsed = JSON.parse(manifestString);

            // Keep only the keys that Lightdash actually needs
            // Removes unused keys like exposures, selectors, unit_tests, etc
            const reducedManifest = {
                nodes: parsed.nodes || {},
                metadata: parsed.metadata || {},
                metrics: parsed.metrics || {},
                docs: parsed.docs || {},
            };

            return JSON.stringify(reducedManifest);
        } catch (e) {
            // If parsing fails, return original string to let validation handle the error
            return manifestString;
        }
    }, []);

    const validateManifest = useCallback((value: string) => {
        if (!value.trim()) {
            setManifestError('');
            return true;
        }

        try {
            const parsed = JSON.parse(value);
            if (!parsed.nodes || !parsed.metadata) {
                setManifestError(
                    'Invalid manifest.json: missing required fields (nodes, metadata)',
                );
                return false;
            }
            setManifestError('');
            return true;
        } catch (e) {
            setManifestError('Invalid JSON format');
            return false;
        }
    }, []);

    const handleManifestChange = useCallback(
        (value: string) => {
            setManifestJson(value);
            validateManifest(value);
        },
        [validateManifest],
    );

    const handleCreatePreview = useCallback(async () => {
        if (!selectedProjectUuid || !previewName) return;

        // Validate manifest if provided
        if (manifestJson.trim() && !validateManifest(manifestJson)) {
            return;
        }

        // Reduce manifest size by removing unnecessary keys
        const finalManifest = manifestJson.trim()
            ? reduceManifest(manifestJson.trim())
            : undefined;

        await createPreviewProject({
            projectUuid: selectedProjectUuid,
            name: previewName,
            dbtConnectionOverrides: {
                branch: selectedBranch ?? undefined,
                environment,
                manifest: finalManifest,
            },
            warehouseConnectionOverrides: { schema },
        });
        onClose();
    }, [
        selectedProjectUuid,
        previewName,
        createPreviewProject,
        selectedBranch,
        environment,
        manifestJson,
        schema,
        onClose,
        validateManifest,
        reduceManifest,
    ]);

    const branches = useBranches(selectedProjectUuid ?? undefined);

    const modalTitle = 'Create a preview project';

    return (
        <MantineModal
            size="xl"
            icon={IconPlus}
            opened={isOpened}
            onClose={onClose}
            title={modalTitle}
            actions={
                <Button
                    disabled={
                        isPreviewCreating ||
                        !selectedProjectUuid ||
                        !previewName
                    }
                    loading={isPreviewCreating}
                    onClick={handleCreatePreview}
                >
                    {isPreviewCreating ? 'Creating preview' : 'Create preview'}
                </Button>
            }
            leftActions={
                <Anchor
                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview/"
                    target="_blank"
                    fz="sm"
                >
                    <Group gap="xs" align="center">
                        Learn more about preview projects{' '}
                        <MantineIcon icon={IconExternalLink} />
                    </Group>
                </Anchor>
            }
        >
            <Stack gap="sm">
                <Select
                    label="Upstream Project"
                    description="The project that will be used to create the preview project"
                    placeholder="Select project"
                    searchable
                    value={selectedProjectUuid}
                    disabled={isLoadingActiveProjectUuid || isLoadingProjects}
                    data={regularProjectList}
                    onChange={(value) => {
                        if (value) handleSelectProject(value);
                    }}
                />

                <TextInput
                    label="Preview Project Name"
                    placeholder="Enter preview name"
                    value={previewName}
                    disabled={isPreviewCreating}
                    onChange={(e) => {
                        setPreviewName(e.currentTarget.value);
                    }}
                    rightSection={
                        <Tooltip label="Generate unique name">
                            <ActionIcon
                                color="foreground.9"
                                variant="subtle"
                                onClick={() =>
                                    setPreviewName(handleGeneratePreviewName())
                                }
                            >
                                <MantineIcon icon={IconRefresh} />
                            </ActionIcon>
                        </Tooltip>
                    }
                />
                {hasGitIntegration ? (
                    <>
                        <Select
                            label="Branch"
                            placeholder={
                                branches.isLoading
                                    ? 'Loading branches...'
                                    : branches.isError
                                      ? 'Failed to load branches'
                                      : 'Select branch'
                            }
                            searchable
                            value={selectedBranch}
                            readOnly={isPreviewCreating}
                            disabled={
                                branches.isError ||
                                (branches.isSuccess &&
                                    (!branches.data ||
                                        branches.data.length <= 0))
                            }
                            data={branches.data ?? []}
                            onChange={(value) => {
                                setSelectedBranch(value);
                            }}
                            rightSection={
                                branches.isFetching && (
                                    <Loader size="xs" color="ldGray.6" />
                                )
                            }
                            error={
                                branches.isError ? (
                                    <Group gap="xs" align="center">
                                        <Text size="xs">
                                            The project will use the default
                                            branch.
                                        </Text>
                                        <Tooltip
                                            label={
                                                branches.error?.error
                                                    ?.message ||
                                                'Failed to fetch branches'
                                            }
                                            multiline
                                            w={250}
                                        >
                                            <ActionIcon
                                                size="xs"
                                                color="red"
                                                variant="transparent"
                                            >
                                                <MantineIcon
                                                    icon={IconHelpCircle}
                                                />
                                            </ActionIcon>
                                        </Tooltip>
                                    </Group>
                                ) : undefined
                            }
                        />{' '}
                        {/* only show if branch changed + change label based on warehouse type? + get value from dbt cloud api */}
                        <TextInput
                            label="Schema/Dataset"
                            placeholder="Change this if you want to override the default schema"
                            value={schema}
                            disabled={isPreviewCreating}
                            onChange={(e) => {
                                setSchema(e.currentTarget.value);
                            }}
                        />
                        {isOpen && (
                            <Stack>
                                {/* only show if branch changed + check if project dbt connection type has environment + advanced option */}
                                <EnvironmentVariablesInput
                                    label="Environment Variables"
                                    value={environment}
                                    onChange={(newVariables) =>
                                        setEnvironment(newVariables)
                                    }
                                    disabled={isPreviewCreating}
                                />

                                <Textarea
                                    label="Custom manifest.json (optional)"
                                    placeholder="Paste your manifest.json content here..."
                                    value={manifestJson}
                                    onChange={(e) =>
                                        handleManifestChange(
                                            e.currentTarget.value,
                                        )
                                    }
                                    minRows={8}
                                    maxRows={15}
                                    disabled={isPreviewCreating}
                                    error={manifestError}
                                    description="Upload a custom manifest.json instead of generating one from the dbt project. This allows you to use pre-compiled dbt models."
                                />
                            </Stack>
                        )}
                        <FormCollapseButton
                            isSectionOpen={isOpen}
                            onClick={() => {
                                setIsOpen(!isOpen);
                            }}
                        >
                            Advanced configuration options
                        </FormCollapseButton>
                    </>
                ) : (
                    <>
                        <Text c="ldGray.6" fz="sm">
                            This{' '}
                            <Text span fw={600} fz="sm">
                                {projectDetails?.dbtConnection?.type
                                    ? DbtProjectTypeLabels[
                                          projectDetails.dbtConnection.type
                                      ]
                                    : 'unknown'}
                            </Text>{' '}
                            project will copy the same connection details as its
                            upstream project. To change the branch of the source
                            code, switch to Github or GitLab connection on{' '}
                            <Anchor
                                target="_blank"
                                fz="sm"
                                href={`/generalSettings/projectManagement/${selectedProjectUuid}/settings`}
                            >
                                project settings
                            </Anchor>
                            .
                        </Text>

                        {isOpen && (
                            <Stack>
                                <Textarea
                                    label="Custom manifest.json (optional)"
                                    placeholder="Paste your manifest.json content here..."
                                    description="Upload a custom manifest.json instead of generating one from the dbt project. This allows you to use pre-compiled dbt models."
                                    value={manifestJson}
                                    onChange={(e) =>
                                        handleManifestChange(
                                            e.currentTarget.value,
                                        )
                                    }
                                    minRows={8}
                                    maxRows={15}
                                    disabled={isPreviewCreating}
                                    error={manifestError}
                                />
                            </Stack>
                        )}
                        <FormCollapseButton
                            isSectionOpen={isOpen}
                            onClick={() => {
                                setIsOpen(!isOpen);
                            }}
                        >
                            Advanced configuration options
                        </FormCollapseButton>
                    </>
                )}
            </Stack>
        </MantineModal>
    );
};

export { CreatePreviewModal };
