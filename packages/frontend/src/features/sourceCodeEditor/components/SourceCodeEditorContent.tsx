import { subject } from '@casl/ability';
import { isGitProjectType } from '@lightdash/common';
import { Box, Group } from '@mantine-8/core';
import { useCallback, useEffect, useMemo, useState, type FC } from 'react';
import { useParams, useSearchParams } from 'react-router';
import ErrorState from '../../../components/common/ErrorState';
import { useProject } from '../../../hooks/useProject';
import { useRefreshServer } from '../../../hooks/useRefreshServer';
import useApp from '../../../providers/App/useApp';
import { useSourceCodeEditor } from '../context/useSourceCodeEditor';
import {
    useEditorLocalStorage,
    useExploreFilePath,
    useGitBranches,
    useGitDirectory,
    useGitFileContent,
    useSaveGitFile,
} from '../hooks';
import CodeEditorPane from './CodeEditorPane';
import CreateBranchModal from './CreateBranchModal';
import CreatePullRequestModal from './CreatePullRequestModal';
import SourceCodeSidebar from './SourceCodeSidebar';
import UnsavedChangesModal from './UnsavedChangesModal';

const SourceCodeEditorContent: FC = () => {
    const { projectUuid: routeProjectUuid } = useParams<{
        projectUuid: string;
    }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const { user } = useApp();
    const {
        setProjectUuid,
        setCurrentBranch: setContextBranch,
        setCurrentFilePath: setContextFilePath,
        setHasUnsavedChanges: setContextHasUnsavedChanges,
    } = useSourceCodeEditor();

    // Read initial values from URL params
    const urlBranch = searchParams.get('branch');
    const urlFile = searchParams.get('file');
    const urlExplore = searchParams.get('explore');

    // Use project UUID from route
    const projectUuid = routeProjectUuid;

    // If explore param is provided, fetch the file path for that explore
    const { data: exploreFilePathData } = useExploreFilePath(
        urlExplore ? projectUuid : undefined,
        urlExplore ?? undefined,
    );

    // UI state - initialize from URL params if present
    const [currentBranch, setCurrentBranch] = useState<string | null>(
        urlBranch,
    );
    const [currentFilePath, setCurrentFilePath] = useState<string | null>(
        urlFile,
    );
    const [editorContent, setEditorContent] = useState<string>('');
    const [originalContent, setOriginalContent] = useState<string>('');
    const [originalSha, setOriginalSha] = useState<string | null>(null);

    // Modal state
    const [isCreateBranchOpen, setIsCreateBranchOpen] = useState(false);
    const [isCreatePROpen, setIsCreatePROpen] = useState(false);
    const [isUnsavedChangesOpen, setIsUnsavedChangesOpen] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<{
        type: 'branch' | 'file';
        value: string;
    } | null>(null);

    // Queries
    const { data: project } = useProject(projectUuid);

    const {
        data: branches,
        isLoading: isLoadingBranches,
        error: branchesError,
    } = useGitBranches(projectUuid);

    // Fetch root directory to find README.md
    const { data: rootDirectory } = useGitDirectory(
        projectUuid,
        currentBranch ?? undefined,
        undefined, // root path
    );

    const { data: fileData, isLoading: isLoadingFile } = useGitFileContent(
        projectUuid,
        currentBranch ?? undefined,
        currentFilePath,
    );

    // Mutations
    const saveFileMutation = useSaveGitFile(projectUuid ?? '');
    const refreshServer = useRefreshServer();

    // Local storage for crash recovery
    const { saveUnsavedContent, clearUnsavedContent, saveLastLocation } =
        useEditorLocalStorage(projectUuid);

    // Derived state
    const canManageSourceCode = useMemo(
        () =>
            user.data?.ability.can(
                'manage',
                subject('SourceCode', {
                    organizationUuid: user.data?.organizationUuid,
                    projectUuid,
                }),
            ) ?? false,
        [user.data?.ability, user.data?.organizationUuid, projectUuid],
    );

    const currentBranchData = useMemo(
        () => branches?.find((b) => b.name === currentBranch),
        [branches, currentBranch],
    );

    const isProtectedBranch = currentBranchData?.isProtected ?? false;

    const hasUnsavedChanges = useMemo(
        () => editorContent !== originalContent,
        [editorContent, originalContent],
    );

    // Sync state to context
    useEffect(() => {
        setProjectUuid(projectUuid ?? null);
    }, [projectUuid, setProjectUuid]);

    useEffect(() => {
        setContextBranch(currentBranch);
    }, [currentBranch, setContextBranch]);

    useEffect(() => {
        setContextFilePath(currentFilePath);
    }, [currentFilePath, setContextFilePath]);

    useEffect(() => {
        setContextHasUnsavedChanges(hasUnsavedChanges);
    }, [hasUnsavedChanges, setContextHasUnsavedChanges]);

    // When explore param is provided and file path is resolved, set the file path
    useEffect(() => {
        if (exploreFilePathData?.filePath && !currentFilePath) {
            setCurrentFilePath(exploreFilePathData.filePath);
        }
    }, [exploreFilePathData, currentFilePath]);

    // Set default branch when branches load
    // Priority: URL param > project's configured branch > repo default
    useEffect(() => {
        if (branches && branches.length > 0 && !currentBranch) {
            // If URL had a branch param, validate it exists
            if (urlBranch) {
                const urlBranchExists = branches.find(
                    (b) => b.name === urlBranch,
                );
                if (urlBranchExists) {
                    setCurrentBranch(urlBranch);
                    return;
                }
            }

            // Check if project has a configured branch (for preview projects)
            const projectBranch =
                project?.dbtConnection &&
                isGitProjectType(project.dbtConnection)
                    ? project.dbtConnection.branch
                    : null;

            // Use project branch if it exists in the branches list, otherwise use protected branch
            const targetBranch = projectBranch
                ? branches.find((b) => b.name === projectBranch)
                : null;
            const protectedBranch = branches.find((b) => b.isProtected);
            setCurrentBranch(
                targetBranch?.name ?? protectedBranch?.name ?? branches[0].name,
            );
        }
    }, [branches, currentBranch, project, urlBranch]);

    // Auto-select README.md (case insensitive) when root directory loads
    // Skip if URL already specified a file or explore
    useEffect(() => {
        if (
            rootDirectory?.type === 'directory' &&
            currentBranch &&
            !currentFilePath &&
            !urlFile && // Don't auto-select if URL specified a file
            !urlExplore // Don't auto-select if URL specified an explore (waiting for file path resolution)
        ) {
            const readme = rootDirectory.entries.find(
                (entry) =>
                    entry.type === 'file' &&
                    entry.name.toLowerCase() === 'readme.md',
            );
            if (readme) {
                setCurrentFilePath(readme.path);
            }
        }
    }, [rootDirectory, currentBranch, currentFilePath, urlFile, urlExplore]);

    // Update editor content when file loads, reset when not available
    useEffect(() => {
        if (fileData?.type === 'file') {
            setEditorContent(fileData.content);
            setOriginalContent(fileData.content);
            setOriginalSha(fileData.sha);
        } else {
            setEditorContent('');
            setOriginalContent('');
            setOriginalSha(null);
        }
    }, [fileData]);

    // Auto-save unsaved content to local storage for crash recovery
    useEffect(() => {
        if (hasUnsavedChanges && currentBranch && currentFilePath) {
            saveUnsavedContent(
                currentBranch,
                currentFilePath,
                editorContent,
                originalSha,
            );
        }
    }, [
        hasUnsavedChanges,
        currentBranch,
        currentFilePath,
        editorContent,
        originalSha,
        saveUnsavedContent,
    ]);

    // Save last viewed location
    useEffect(() => {
        saveLastLocation(currentBranch, currentFilePath);
    }, [currentBranch, currentFilePath, saveLastLocation]);

    // Sync state to URL params (preserving editor=1 and other params)
    useEffect(() => {
        const newParams = new URLSearchParams(searchParams);
        if (currentBranch) {
            newParams.set('branch', currentBranch);
        } else {
            newParams.delete('branch');
        }
        if (currentFilePath) {
            newParams.set('file', currentFilePath);
        } else {
            newParams.delete('file');
        }
        // Remove explore param after it's been resolved to a file
        if (currentFilePath && urlExplore) {
            newParams.delete('explore');
        }
        setSearchParams(newParams, { replace: true });
    }, [
        currentBranch,
        currentFilePath,
        setSearchParams,
        searchParams,
        urlExplore,
    ]);

    // Navigation handlers with unsaved changes check
    const handleBranchChange = useCallback(
        (branch: string) => {
            if (hasUnsavedChanges) {
                setPendingNavigation({ type: 'branch', value: branch });
                setIsUnsavedChangesOpen(true);
            } else {
                setCurrentBranch(branch);
                setCurrentFilePath(null);
            }
        },
        [hasUnsavedChanges],
    );

    const handleFileSelect = useCallback(
        (path: string) => {
            if (hasUnsavedChanges && path !== currentFilePath) {
                setPendingNavigation({ type: 'file', value: path });
                setIsUnsavedChangesOpen(true);
            } else {
                setCurrentFilePath(path);
            }
        },
        [hasUnsavedChanges, currentFilePath],
    );

    const handleDiscardChanges = useCallback(() => {
        if (pendingNavigation) {
            if (pendingNavigation.type === 'branch') {
                setCurrentBranch(pendingNavigation.value);
                setCurrentFilePath(null);
            } else {
                setCurrentFilePath(pendingNavigation.value);
            }
            setPendingNavigation(null);
        }
        setIsUnsavedChangesOpen(false);
    }, [pendingNavigation]);

    const handleSave = useCallback(async () => {
        if (!currentBranch || !currentFilePath) return;

        await saveFileMutation.mutateAsync({
            branch: currentBranch,
            path: currentFilePath,
            content: editorContent,
            sha: originalSha ?? undefined,
        });

        setOriginalContent(editorContent);
        clearUnsavedContent();

        // If saved to the project's configured branch, trigger a refresh
        const projectBranch =
            project?.dbtConnection && isGitProjectType(project.dbtConnection)
                ? project.dbtConnection.branch
                : null;

        if (projectBranch && currentBranch === projectBranch) {
            refreshServer.mutate();
        }
    }, [
        currentBranch,
        currentFilePath,
        editorContent,
        originalSha,
        saveFileMutation,
        clearUnsavedContent,
        project,
        refreshServer,
    ]);

    const handleBranchCreated = useCallback((branchName: string) => {
        setCurrentBranch(branchName);
        setCurrentFilePath(null);
    }, []);

    const handlePRCreated = useCallback((prUrl: string) => {
        // Open PR URL in new tab
        window.open(prUrl, '_blank');
    }, []);

    if (branchesError) {
        return <ErrorState error={branchesError.error} />;
    }

    return (
        <>
            <Group gap={0} align="stretch" wrap="nowrap" h="100%" w="100%">
                <Box w={300} style={{ flexShrink: 0 }}>
                    <SourceCodeSidebar
                        projectUuid={projectUuid ?? ''}
                        branches={branches ?? []}
                        currentBranch={currentBranch}
                        currentFilePath={currentFilePath}
                        onBranchChange={handleBranchChange}
                        onCreateBranch={() => setIsCreateBranchOpen(true)}
                        onFileSelect={handleFileSelect}
                        isLoadingBranches={isLoadingBranches}
                    />
                </Box>

                <Box flex={1}>
                    <CodeEditorPane
                        filePath={currentFilePath}
                        content={editorContent}
                        isLoading={isLoadingFile && currentFilePath !== null}
                        hasUnsavedChanges={hasUnsavedChanges}
                        isProtectedBranch={isProtectedBranch}
                        canManage={canManageSourceCode}
                        isSaving={saveFileMutation.isLoading}
                        onChange={setEditorContent}
                        onSave={handleSave}
                        onCreatePR={() => setIsCreatePROpen(true)}
                    />
                </Box>
            </Group>

            {/* Modals */}
            {currentBranch && (
                <>
                    <CreateBranchModal
                        opened={isCreateBranchOpen}
                        onClose={() => setIsCreateBranchOpen(false)}
                        projectUuid={projectUuid ?? ''}
                        sourceBranch={currentBranch}
                        onBranchCreated={handleBranchCreated}
                    />

                    <CreatePullRequestModal
                        opened={isCreatePROpen}
                        onClose={() => setIsCreatePROpen(false)}
                        projectUuid={projectUuid ?? ''}
                        branch={currentBranch}
                        onPRCreated={handlePRCreated}
                    />
                </>
            )}

            <UnsavedChangesModal
                opened={isUnsavedChangesOpen}
                onClose={() => {
                    setIsUnsavedChangesOpen(false);
                    setPendingNavigation(null);
                }}
                onDiscard={handleDiscardChanges}
            />
        </>
    );
};

export default SourceCodeEditorContent;
