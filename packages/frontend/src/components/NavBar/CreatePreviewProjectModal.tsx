import { subject } from '@casl/ability';
import {
    DbtProjectType,
    DbtProjectTypeLabels,
    getInvalidDbtEnvironmentVariableKeys,
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
    Switch,
    Text,
    Textarea,
    TextInput,
    Tooltip,
    type ComboboxItem,
    type ComboboxItemGroup,
} from '@mantine/core';
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
import { Trans, useTranslation } from 'react-i18next';
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
    error?: string;
};

const EnvironmentVariablesInput: FC<EnvironmentVariablesInputProps> = ({
    value,
    onChange,
    label,
    disabled,
    documentationUrl,
    labelHelp,
    error,
}) => {
    const { t } = useTranslation('navigation');
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
            error={error}
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
                            placeholder={t(
                                'createPreview.envVars.keyPlaceholder',
                            )}
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
                            placeholder={t(
                                'createPreview.envVars.valuePlaceholder',
                            )}
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
                    {t('createPreview.envVars.addVariable')}
                </Button>
            </Stack>
        </Input.Wrapper>
    );
};

type Props = {
    isOpened: boolean;
    onClose: () => void;
    preselectedProjectUuid?: string;
};

const CreatePreviewModal: FC<Props> = ({
    isOpened,
    onClose,
    preselectedProjectUuid,
}) => {
    const { t } = useTranslation('navigation');
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
    const [asyncCopyContent, setAsyncCopyContent] = useState(false);
    const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
    const [schema, setSchema] = useState<string>();
    const [environment, setEnvironment] = useState<
        DbtProjectEnvironmentVariable[]
    >([]);
    const [environmentError, setEnvironmentError] = useState<string>('');
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

    const projectItems = useMemo(() => {
        if (isLoadingProjects || !projects || !user.data) return [];

        return projects
            .filter(
                (p) =>
                    p.type === ProjectType.DEFAULT &&
                    p.provisioningSource !== 'analytics',
            )
            .map((project) => ({
                value: project.projectUuid,
                label: project.name,
                disabled: user.data.ability.cannot(
                    'create',
                    subject('Project', {
                        organizationUuid: user.data.organizationUuid,
                        upstreamProjectUuid: project.projectUuid,
                        type: ProjectType.PREVIEW,
                    }),
                ),
            }));
    }, [isLoadingProjects, projects, user.data]);

    const regularProjectList: (
        | ComboboxItem
        | ComboboxItemGroup<ComboboxItem>
    )[] = useMemo(() => {
        const available = projectItems.filter((item) => !item.disabled);
        const restricted = projectItems.filter((item) => item.disabled);

        return restricted.length > 0
            ? [
                  ...available,
                  {
                      group: t('createPreview.requiresDeveloperAccess'),
                      items: restricted,
                  },
              ]
            : available;
    }, [projectItems, t]);

    const { data: projectDetails } = useProject(
        selectedProjectUuid ?? undefined,
    );
    const hasGitIntegration = useMemo(() => {
        return [DbtProjectType.GITHUB, DbtProjectType.GITLAB].includes(
            projectDetails?.dbtConnection?.type as DbtProjectType,
        );
    }, [projectDetails?.dbtConnection?.type]);

    useEffect(() => {
        const initialProjectUuid = preselectedProjectUuid ?? activeProjectUuid;
        if (
            !isLoadingActiveProjectUuid &&
            initialProjectUuid &&
            !selectedProjectUuid &&
            projects
        ) {
            const initialProjectValue = projectItems.find(
                (project) => project.value === initialProjectUuid,
            );

            if (initialProjectValue && !initialProjectValue.disabled) {
                setSelectedProjectUuid(initialProjectUuid);
                setPreviewName(handleGeneratePreviewName());
            }
        }
    }, [
        activeProjectUuid,
        preselectedProjectUuid,
        handleGeneratePreviewName,
        isLoadingActiveProjectUuid,
        projects,
        projectItems,
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

    const validateManifest = useCallback(
        (value: string) => {
            if (!value.trim()) {
                setManifestError('');
                return true;
            }

            try {
                const parsed = JSON.parse(value);
                if (!parsed.nodes || !parsed.metadata) {
                    setManifestError(t('createPreview.manifest.missingFields'));
                    return false;
                }
                setManifestError('');
                return true;
            } catch (e) {
                setManifestError(t('createPreview.manifest.invalidJson'));
                return false;
            }
        },
        [t],
    );

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

        const invalidEnvironmentKeys =
            getInvalidDbtEnvironmentVariableKeys(environment);
        if (invalidEnvironmentKeys.length > 0) {
            setEnvironmentError(
                t('createPreview.envVars.invalidKeys', {
                    keys: invalidEnvironmentKeys.join(', '),
                }),
            );
            return;
        }
        setEnvironmentError('');

        // Reduce manifest size by removing unnecessary keys
        const finalManifest = manifestJson.trim()
            ? reduceManifest(manifestJson.trim())
            : undefined;

        await createPreviewProject({
            projectUuid: selectedProjectUuid,
            name: previewName,
            asyncCopyContent,
            dbtConnectionOverrides: {
                branch: selectedBranch ?? undefined,
                environment: environment.length > 0 ? environment : undefined,
                manifest: finalManifest,
            },
            warehouseConnectionOverrides: { schema },
        });
        onClose();
    }, [
        selectedProjectUuid,
        previewName,
        asyncCopyContent,
        createPreviewProject,
        selectedBranch,
        environment,
        manifestJson,
        schema,
        onClose,
        validateManifest,
        reduceManifest,
        t,
    ]);

    const branches = useBranches(selectedProjectUuid ?? undefined);

    const modalTitle = t('createPreview.title');

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
                    {isPreviewCreating
                        ? t('createPreview.creating')
                        : t('createPreview.create')}
                </Button>
            }
            leftActions={
                <Anchor
                    href="https://docs.lightdash.com/guides/cli/how-to-use-lightdash-preview/"
                    target="_blank"
                    fz="sm"
                >
                    <Group gap="xs" align="center">
                        {t('createPreview.learnMore')}{' '}
                        <MantineIcon icon={IconExternalLink} />
                    </Group>
                </Anchor>
            }
        >
            <Stack gap="sm">
                <Select
                    label={t('createPreview.upstreamProject.label')}
                    description={t('createPreview.upstreamProject.description')}
                    placeholder={t('createPreview.upstreamProject.placeholder')}
                    searchable
                    value={selectedProjectUuid}
                    disabled={isLoadingActiveProjectUuid || isLoadingProjects}
                    data={regularProjectList}
                    onChange={(value) => {
                        if (value) handleSelectProject(value);
                    }}
                />

                <TextInput
                    label={t('createPreview.name.label')}
                    placeholder={t('createPreview.name.placeholder')}
                    value={previewName}
                    disabled={isPreviewCreating}
                    onChange={(e) => {
                        setPreviewName(e.currentTarget.value);
                    }}
                    rightSection={
                        <Tooltip label={t('createPreview.name.generate')}>
                            <ActionIcon
                                color="foreground.9"
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
                            label={t('createPreview.branch.label')}
                            placeholder={
                                branches.isLoading
                                    ? t('createPreview.branch.loading')
                                    : branches.isError
                                      ? t('createPreview.branch.loadFailed')
                                      : t('createPreview.branch.placeholder')
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
                                            {t(
                                                'createPreview.branch.useDefault',
                                            )}
                                        </Text>
                                        <Tooltip
                                            label={
                                                branches.error?.error
                                                    ?.message ||
                                                t(
                                                    'createPreview.branch.fetchFailed',
                                                )
                                            }
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
                            label={t('createPreview.schema.label')}
                            placeholder={t('createPreview.schema.placeholder')}
                            value={schema}
                            disabled={isPreviewCreating}
                            onChange={(e) => {
                                setSchema(e.currentTarget.value);
                            }}
                        />
                        {isOpen && (
                            <Stack>
                                <Switch
                                    label={t('createPreview.asyncCopy.label')}
                                    description={t(
                                        'createPreview.asyncCopy.description',
                                    )}
                                    checked={asyncCopyContent}
                                    onChange={(event) =>
                                        setAsyncCopyContent(
                                            event.currentTarget.checked,
                                        )
                                    }
                                    disabled={isPreviewCreating}
                                />
                                {/* only show if branch changed + check if project dbt connection type has environment + advanced option */}
                                <EnvironmentVariablesInput
                                    label={t('createPreview.envVars.label')}
                                    value={environment}
                                    onChange={(newVariables) => {
                                        setEnvironment(newVariables);
                                        setEnvironmentError('');
                                    }}
                                    disabled={isPreviewCreating}
                                    error={environmentError}
                                />

                                <Textarea
                                    label={t('createPreview.manifest.label')}
                                    placeholder={t(
                                        'createPreview.manifest.placeholder',
                                    )}
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
                                    description={t(
                                        'createPreview.manifest.description',
                                    )}
                                />
                            </Stack>
                        )}
                        <FormCollapseButton
                            isSectionOpen={isOpen}
                            onClick={() => {
                                setIsOpen(!isOpen);
                            }}
                        >
                            {t('createPreview.advancedOptions')}
                        </FormCollapseButton>
                    </>
                ) : (
                    <>
                        <Text c="dimmed" fz="sm">
                            <Trans
                                t={t}
                                i18nKey="createPreview.noGitIntegration"
                                values={{
                                    type: projectDetails?.dbtConnection?.type
                                        ? DbtProjectTypeLabels[
                                              projectDetails.dbtConnection.type
                                          ]
                                        : t('createPreview.unknownType'),
                                }}
                                components={{
                                    type: <Text span fw={600} fz="sm" />,
                                    anchor: (
                                        <Anchor
                                            target="_blank"
                                            fz="sm"
                                            href={`/generalSettings/projectManagement/${selectedProjectUuid}/settings`}
                                        />
                                    ),
                                }}
                            />
                        </Text>

                        {isOpen && (
                            <Stack>
                                <Switch
                                    label={t('createPreview.asyncCopy.label')}
                                    description={t(
                                        'createPreview.asyncCopy.description',
                                    )}
                                    checked={asyncCopyContent}
                                    onChange={(event) =>
                                        setAsyncCopyContent(
                                            event.currentTarget.checked,
                                        )
                                    }
                                    disabled={isPreviewCreating}
                                />
                                <Textarea
                                    label={t('createPreview.manifest.label')}
                                    placeholder={t(
                                        'createPreview.manifest.placeholder',
                                    )}
                                    description={t(
                                        'createPreview.manifest.description',
                                    )}
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
                            {t('createPreview.advancedOptions')}
                        </FormCollapseButton>
                    </>
                )}
            </Stack>
        </MantineModal>
    );
};

export { CreatePreviewModal };
