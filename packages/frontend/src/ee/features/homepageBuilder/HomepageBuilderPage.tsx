import { subject } from '@casl/ability';
import { type ProjectHomepage } from '@lightdash/common';
import { Button, Stack, Text, Title } from '@mantine-8/core';
import { IconSquareRoundedPlus } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { Navigate, useParams, useSearchParams } from 'react-router';
import { v4 as uuidv4 } from 'uuid';
import MantineIcon from '../../../components/common/MantineIcon';
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

    const openHomepage = (created: ProjectHomepage) => {
        setIsCreateModalOpen(false);
        setSearchParams({ homepage: created.homepageUuid });
    };

    const closeCreateModal = () => {
        setIsCreateModalOpen(false);
        if (searchParams.get('create')) {
            const next = new URLSearchParams(searchParams);
            next.delete('create');
            setSearchParams(next, { replace: true });
        }
    };

    if (!homepage.data) {
        const handleCreateFirst = () =>
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

        return (
            <Page withFixedContent withPaddedContent>
                <Stack gap="sm" maw={420} mx="auto" mt="15vh" align="center">
                    <Title order={3} ta="center">
                        Create your first homepage
                    </Title>
                    <Text c="dimmed" size="sm" ta="center">
                        Curate a landing page for this project. Publishing makes
                        it what everyone sees when they land in Lightdash.
                    </Text>
                    <Button
                        leftSection={
                            <MantineIcon icon={IconSquareRoundedPlus} />
                        }
                        loading={createFirstHomepage.isLoading}
                        onClick={handleCreateFirst}
                    >
                        Create homepage
                    </Button>
                </Stack>
            </Page>
        );
    }

    return (
        <Page noContentPadding>
            <HomepageEditor
                key={`${homepage.data.homepageUuid}-${editorEpoch}`}
                homepage={homepage.data}
                projectUuid={projectUuid}
                homepages={homepages.data ?? []}
                onSwitchHomepage={(homepageUuid) =>
                    setSearchParams({ homepage: homepageUuid })
                }
                onCreateNew={() => setIsCreateModalOpen(true)}
                onDeleted={() => setSearchParams({})}
                onConflictReload={async () => {
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
