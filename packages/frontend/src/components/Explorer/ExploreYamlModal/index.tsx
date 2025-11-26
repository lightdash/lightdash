import { subject } from '@casl/ability';
import { lightdashDbtYamlSchema } from '@lightdash/common';
import {
    Alert,
    Button,
    Group,
    Loader,
    Modal,
    Stack,
    Text,
    TextInput,
    Textarea,
} from '@mantine/core';
import Editor, {
    type BeforeMount,
    type Monaco,
    type OnMount,
} from '@monaco-editor/react';
import {
    IconAlertCircle,
    IconCheck,
    IconCode,
    IconGitPullRequest,
    IconPencil,
} from '@tabler/icons-react';
import type { editor } from 'monaco-editor';
import { configureMonacoYaml } from 'monaco-yaml';
import {
    type FC,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    LIGHTDASH_THEME,
    MONACO_DEFAULT_OPTIONS,
} from '../../../features/sqlRunner/utils/monaco';
import {
    useCreateFilePullRequest,
    useExploreYamlFile,
} from '../../../hooks/gitIntegration/useExploreYaml';
import useApp from '../../../providers/App/useApp';
import MantineIcon from '../../common/MantineIcon';
import styles from './ExploreYamlModal.module.css';
// eslint-disable-next-line import/no-unresolved, import/extensions
import YamlWorker from './yaml.worker.ts?worker';

// Configure Monaco environment to use the YAML worker
// This must be done before Monaco loads
// eslint-disable-next-line no-restricted-globals
self.MonacoEnvironment = {
    getWorker(_moduleId, label) {
        if (label === 'yaml') {
            return new YamlWorker();
        }
        // For other languages (like editorWorkerService), use the default editor worker
        return new Worker(
            new URL(
                'monaco-editor/esm/vs/editor/editor.worker',
                import.meta.url,
            ),
            { type: 'module' },
        );
    },
};

// Configure monaco-yaml with schema once at module level
let yamlConfigured = false;
const configureYamlSchema = (monaco: Monaco) => {
    if (yamlConfigured) return;
    yamlConfigured = true;

    configureMonacoYaml(monaco, {
        enableSchemaRequest: false,
        schemas: [
            {
                uri: 'https://schemas.lightdash.com/lightdash/lightdash-dbt-2.0.json',
                fileMatch: ['*'],
                schema: lightdashDbtYamlSchema as Record<string, unknown>,
            },
        ],
    });
};

type ExploreYamlModalProps = {
    opened: boolean;
    onClose: () => void;
    projectUuid: string;
    exploreName: string;
};

const ExploreYamlModal: FC<ExploreYamlModalProps> = ({
    opened,
    onClose,
    projectUuid,
    exploreName,
}) => {
    const { user } = useApp();
    const [isEditMode, setIsEditMode] = useState(false);
    const [currentContent, setCurrentContent] = useState<string>('');
    const [showPrForm, setShowPrForm] = useState(false);
    const [prTitle, setPrTitle] = useState('');
    const [prDescription, setPrDescription] = useState('');
    const [validationErrors, setValidationErrors] = useState<number>(0);
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const markerListenerRef = useRef<{ dispose: () => void } | null>(null);

    const canManageSourceCode = useMemo(
        () =>
            user.data?.ability.can(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                }),
            ),
        [user.data?.ability, user.data?.organizationUuid, projectUuid],
    );

    const {
        data: yamlFile,
        isLoading,
        error,
    } = useExploreYamlFile(projectUuid, exploreName, opened);

    const { mutate: createPR, isLoading: isCreatingPR } =
        useCreateFilePullRequest(projectUuid);

    // Initialize content when data loads
    useEffect(() => {
        if (yamlFile?.content) {
            setCurrentContent(yamlFile.content);
        }
    }, [yamlFile?.content]);

    // Reset state when modal closes
    useEffect(() => {
        if (!opened) {
            setIsEditMode(false);
            setShowPrForm(false);
            setPrTitle('');
            setPrDescription('');
            setValidationErrors(0);
        }
    }, [opened]);

    // Clean up marker listener on unmount
    useEffect(() => {
        return () => {
            markerListenerRef.current?.dispose();
        };
    }, []);

    const hasChanges = useMemo(
        () =>
            Boolean(yamlFile?.content) &&
            Boolean(currentContent) &&
            yamlFile?.content !== currentContent,
        [yamlFile?.content, currentContent],
    );

    const handleBeforeMount: BeforeMount = useCallback((monaco) => {
        monaco.editor.defineTheme('lightdash', {
            base: 'vs',
            inherit: true,
            ...LIGHTDASH_THEME,
        });

        // Configure YAML schema validation
        configureYamlSchema(monaco);
    }, []);

    const handleEditorMount: OnMount = useCallback((editorInstance, monaco) => {
        editorRef.current = editorInstance;

        // Focus the editor when mounted
        editorInstance.focus();

        // Listen for marker changes to track validation errors
        const model = editorInstance.getModel();
        if (model) {
            // Helper to count validation issues (errors and warnings)
            const countValidationIssues = (
                markers: ReturnType<typeof monaco.editor.getModelMarkers>,
            ) =>
                markers.filter(
                    (m) =>
                        m.severity === monaco.MarkerSeverity.Error ||
                        m.severity === monaco.MarkerSeverity.Warning,
                ).length;

            // Check initial markers
            const markers = monaco.editor.getModelMarkers({
                resource: model.uri,
            });
            setValidationErrors(countValidationIssues(markers));

            // Subscribe to marker changes
            markerListenerRef.current?.dispose();
            markerListenerRef.current = monaco.editor.onDidChangeMarkers(
                (uris) => {
                    if (
                        uris.some(
                            (uri) => uri.toString() === model.uri.toString(),
                        )
                    ) {
                        const currentMarkers = monaco.editor.getModelMarkers({
                            resource: model.uri,
                        });
                        setValidationErrors(
                            countValidationIssues(currentMarkers),
                        );
                    }
                },
            );
        }
    }, []);

    const handleEditorChange = useCallback((value: string | undefined) => {
        setCurrentContent(value ?? '');
    }, []);

    const handleEditClick = useCallback(() => {
        setIsEditMode(true);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setIsEditMode(false);
        if (yamlFile?.content) {
            setCurrentContent(yamlFile.content);
        }
    }, [yamlFile?.content]);

    const handleCreatePRClick = useCallback(() => {
        if (!yamlFile) return;

        // Auto-generate title and description
        const fileName = yamlFile.filePath.split('/').pop() ?? 'file';
        setPrTitle(`Update ${fileName}`);
        setPrDescription(
            `This pull request updates the model configuration in \`${yamlFile.filePath}\`.\n\nChanges made via Lightdash.`,
        );
        setShowPrForm(true);
    }, [yamlFile]);

    const handleSubmitPR = useCallback(() => {
        if (!yamlFile) return;

        createPR(
            {
                filePath: yamlFile.filePath,
                content: currentContent,
                originalSha: yamlFile.sha,
                title: prTitle,
                description: prDescription,
            },
            {
                onSuccess: () => {
                    setShowPrForm(false);
                    setIsEditMode(false);
                    onClose();
                },
            },
        );
    }, [createPR, yamlFile, currentContent, prTitle, prDescription, onClose]);

    const editorOptions = useMemo(
        () => ({
            ...MONACO_DEFAULT_OPTIONS,
            readOnly: !isEditMode,
            lineNumbers: 'on' as const,
            renderLineHighlight: 'all' as const,
            scrollBeyondLastLine: false,
            padding: { top: 16, bottom: 16 },
            wordWrap: 'on' as const,
            scrollbar: {
                horizontal: 'hidden' as const,
                verticalScrollbarSize: 8,
            },
        }),
        [isEditMode],
    );

    return (
        <Modal.Root opened={opened} onClose={onClose} size="xl" centered>
            <Modal.Overlay />
            <Modal.Content className={styles.modalContent}>
                <Modal.Header className={styles.modalHeader}>
                    {yamlFile && (
                        <div className={styles.fileInfo}>
                            <MantineIcon icon={IconCode} size="sm" />
                            <Text fz="sm" fw={500}>
                                {yamlFile.filePath.split('/').pop()}
                            </Text>
                            {hasChanges && (
                                <Text fz="xs" c="dimmed">
                                    (modified)
                                </Text>
                            )}
                        </div>
                    )}
                    <Modal.CloseButton />
                </Modal.Header>

                <Modal.Body className={styles.modalBody}>
                    {isLoading && (
                        <Stack align="center" justify="center" h="100%">
                            <Loader size="lg" color="gray" />
                            <Text c="dimmed">Loading source file...</Text>
                        </Stack>
                    )}

                    {error && (
                        <Alert
                            icon={<IconAlertCircle size="1rem" />}
                            title="Error loading file"
                            color="red"
                            variant="light"
                        >
                            {error.error.message}
                        </Alert>
                    )}

                    {yamlFile && !isLoading && !showPrForm && (
                        <div className={styles.editorContainer}>
                            <Editor
                                height="100%"
                                language="yaml"
                                value={currentContent}
                                theme="lightdash"
                                options={editorOptions}
                                beforeMount={handleBeforeMount}
                                onMount={handleEditorMount}
                                onChange={handleEditorChange}
                                loading={<Loader color="gray" size="sm" />}
                            />
                        </div>
                    )}

                    {showPrForm && (
                        <Stack spacing="md">
                            <Text fw={600}>Create Pull Request</Text>
                            <TextInput
                                label="Title"
                                value={prTitle}
                                onChange={(e) => setPrTitle(e.target.value)}
                                required
                            />
                            <Textarea
                                label="Description"
                                value={prDescription}
                                onChange={(e) =>
                                    setPrDescription(e.target.value)
                                }
                                minRows={4}
                                autosize
                            />
                        </Stack>
                    )}
                </Modal.Body>

                {yamlFile && !isLoading && (
                    <div className={styles.modalFooter}>
                        {!showPrForm ? (
                            <Group position="apart" w="100%">
                                <Group spacing="sm">
                                    {isEditMode && (
                                        <Button
                                            variant="subtle"
                                            color="gray"
                                            onClick={handleCancelEdit}
                                        >
                                            Cancel
                                        </Button>
                                    )}
                                </Group>
                                <Group spacing="sm">
                                    {isEditMode && validationErrors > 0 && (
                                        <Text fz="sm" c="dimmed">
                                            {validationErrors}{' '}
                                            {validationErrors === 1
                                                ? 'issue'
                                                : 'issues'}
                                        </Text>
                                    )}
                                    {!isEditMode ? (
                                        canManageSourceCode && (
                                            <Button
                                                leftIcon={
                                                    <MantineIcon
                                                        icon={IconPencil}
                                                    />
                                                }
                                                variant="light"
                                                onClick={handleEditClick}
                                            >
                                                Edit
                                            </Button>
                                        )
                                    ) : (
                                        <Button
                                            leftIcon={
                                                <MantineIcon
                                                    icon={IconGitPullRequest}
                                                />
                                            }
                                            disabled={!hasChanges}
                                            onClick={handleCreatePRClick}
                                        >
                                            Create Pull Request
                                        </Button>
                                    )}
                                </Group>
                            </Group>
                        ) : (
                            <Group position="right" w="100%">
                                <Button
                                    variant="subtle"
                                    color="gray"
                                    onClick={() => setShowPrForm(false)}
                                >
                                    Back
                                </Button>
                                <Button
                                    leftIcon={<MantineIcon icon={IconCheck} />}
                                    loading={isCreatingPR}
                                    onClick={handleSubmitPR}
                                    disabled={!prTitle.trim()}
                                >
                                    Submit Pull Request
                                </Button>
                            </Group>
                        )}
                    </div>
                )}
            </Modal.Content>
        </Modal.Root>
    );
};

export default ExploreYamlModal;
