import { subject } from '@casl/ability';
import { type ProjectHomepage } from '@lightdash/common';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState, type FC } from 'react';
import {
    Navigate,
    useNavigate,
    useParams,
    useSearchParams,
} from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import Page from '../../../components/common/Page/Page';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { useIsCopilotEnabled } from '../aiCopilot/hooks/useIsCopilotEnabled';
import { CreateHomepageModal } from './CreateHomepageModal';
import { HomepageEditor } from './HomepageEditor';
import {
    useCreateHomepageWithDraft,
    useHomepageBuilderFlag,
    useHomepageForBuilder,
    useProjectHomepages,
} from './hooks/useProjectHomepage';

// ts-unused-exports:disable-next-line
export const HomepageBuilderPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editorEpoch, setEditorEpoch] = useState(0);
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(
        searchParams.get('create') === '1',
    );
    const selectedHomepageUuid = searchParams.get('homepage') ?? undefined;
    const { user } = useApp();
    const { isEnabled: isFlagEnabled, isLoading: isFlagLoading } =
        useHomepageBuilderFlag();
    const { isCopilotEnabled, isLoading: isCopilotLoading } =
        useIsCopilotEnabled();
    const homepage = useHomepageForBuilder(projectUuid, {
        enabled: isFlagEnabled,
        homepageUuid: selectedHomepageUuid,
    });
    const homepages = useProjectHomepages(projectUuid, {
        enabled: isFlagEnabled,
    });
    const createFirstHomepage = useCreateHomepageWithDraft(projectUuid ?? '');

    const canManage =
        user.data?.ability?.can(
            'manage',
            subject('ProjectHomepage', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    const openHomepage = useCallback(
        (created: ProjectHomepage) => {
            setIsCreateModalOpen(false);
            setSearchParams({ homepage: created.homepageUuid });
        },
        [setSearchParams],
    );

    // When there's no homepage yet, skip any intermediate screen: create a
    // default one and drop straight into the builder. Guarded so it fires once
    // and never while we're navigating away after deleting the last homepage.
    const isLeaving = useRef(false);
    const didAutoCreate = useRef(false);
    const shouldAutoCreate =
        isFlagEnabled &&
        isCopilotEnabled &&
        canManage &&
        !!projectUuid &&
        homepage.isFetchedAfterMount &&
        !homepage.data &&
        !isLeaving.current;

    useEffect(() => {
        if (!shouldAutoCreate || didAutoCreate.current) return;
        didAutoCreate.current = true;
        createFirstHomepage.mutate(
            {
                name: 'Homepage',
                draftConfig: {
                    version: 1,
                    rows: [
                        {
                            id: uuidv4(),
                            blocks: [
                                {
                                    id: uuidv4(),
                                    type: 'ask-ai-hero',
                                    config: { showGreeting: true },
                                },
                            ],
                        },
                    ],
                },
            },
            { onSuccess: openHomepage },
        );
    }, [shouldAutoCreate, createFirstHomepage, openHomepage]);

    if (isFlagLoading || isCopilotLoading) {
        return <PageSpinner />;
    }

    // Without copilot the builder is disabled (see Home.tsx) — send anyone who
    // reaches this route directly back to the classic homepage.
    if (isFlagEnabled && !isCopilotEnabled) {
        return projectUuid ? (
            <Navigate to={`/projects/${projectUuid}/home`} replace />
        ) : (
            <ForbiddenPanel />
        );
    }

    // Wait for a fresh fetch: the editor snapshots the draft on mount, so
    // seeding it from a stale cache would autosave old state over the server
    if (isFlagEnabled && !homepage.isFetchedAfterMount) {
        return <PageSpinner />;
    }

    if (!isFlagEnabled || !canManage || !projectUuid) {
        return <ForbiddenPanel />;
    }

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        if (searchParams.get('create')) {
            const next = new URLSearchParams(searchParams);
            next.delete('create');
            setSearchParams(next, { replace: true });
        }
    };

    // No homepage yet: the auto-create effect is handling it — show a spinner
    // until it opens the new homepage.
    if (!homepage.data) {
        return <PageSpinner />;
    }

    const currentHomepageUuid = homepage.data.homepageUuid;

    return (
        <Page noContentPadding>
            <HomepageEditor
                key={`${currentHomepageUuid}-${editorEpoch}`}
                homepage={homepage.data}
                projectUuid={projectUuid}
                homepages={homepages.data ?? []}
                onSwitchHomepage={(homepageUuid) =>
                    setSearchParams({ homepage: homepageUuid })
                }
                onCreateNew={() => setIsCreateModalOpen(true)}
                onDeleted={() => {
                    const remaining = (homepages.data ?? []).filter(
                        (h) => h.homepageUuid !== currentHomepageUuid,
                    );
                    if (remaining.length > 0) {
                        setSearchParams({
                            homepage: remaining[0].homepageUuid,
                        });
                    } else {
                        // Deleted the last one — leave the builder for /home.
                        isLeaving.current = true;
                        void navigate(`/projects/${projectUuid}/home`);
                    }
                }}
                onReload={async () => {
                    await queryClient.refetchQueries([
                        'project_homepage',
                        projectUuid,
                        'builder',
                    ]);
                    setEditorEpoch((epoch) => epoch + 1);
                }}
            />
            <CreateHomepageModal
                opened={isCreateModalOpen}
                onClose={closeCreateModal}
                projectUuid={projectUuid}
                homepages={homepages.data ?? []}
                onCreated={openHomepage}
            />
        </Page>
    );
};
