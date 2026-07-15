import { subject } from '@casl/ability';
import { type ProjectHomepage } from '@lightdash/common';
import {
    Button,
    Card,
    Radio,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type FC } from 'react';
import { useParams, useSearchParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { HomepageEditor } from './HomepageEditor';
import {
    useCreateHomepage,
    useHomepageBuilderFlag,
    useHomepageForBuilder,
    useProjectHomepages,
} from './hooks/useProjectHomepage';

const CreateHomepageForm: FC<{
    projectUuid: string;
    homepages: ProjectHomepage[];
    onCreated: (homepage: ProjectHomepage) => void;
    onCancel: (() => void) | null;
}> = ({ projectUuid, homepages, onCreated, onCancel }) => {
    const createMutation = useCreateHomepage(projectUuid);
    const [name, setName] = useState('');
    const [startFrom, setStartFrom] = useState('blank');

    return (
        <Stack gap="sm" maw={560}>
            {onCancel && (
                <Button
                    variant="subtle"
                    size="xs"
                    w="fit-content"
                    leftSection={<MantineIcon icon={IconArrowLeft} />}
                    onClick={onCancel}
                >
                    Back
                </Button>
            )}
            <Title order={3}>Create a homepage</Title>
            <Text c="dimmed" size="sm">
                Curate a landing page for this project. Publishing makes it what
                everyone sees when they land in Lightdash.
            </Text>
            <TextInput
                label="Name"
                placeholder="e.g. Team homepage"
                value={name}
                onChange={(e) => setName(e.currentTarget.value)}
            />
            <Radio.Group
                label="Start from"
                value={startFrom}
                onChange={setStartFrom}
            >
                <Stack gap="xs" mt="xs">
                    <Card withBorder p="sm">
                        <Radio value="blank" label="Blank" />
                    </Card>
                    {homepages.map((homepage) => (
                        <Card key={homepage.homepageUuid} withBorder p="sm">
                            <Radio
                                value={homepage.homepageUuid}
                                label={`Duplicate “${homepage.name}”`}
                            />
                        </Card>
                    ))}
                </Stack>
            </Radio.Group>
            <Button
                w="fit-content"
                disabled={name.trim().length === 0}
                loading={createMutation.isLoading}
                onClick={() =>
                    createMutation.mutate(
                        {
                            name: name.trim(),
                            duplicateFrom:
                                startFrom === 'blank' ? undefined : startFrom,
                        },
                        { onSuccess: onCreated },
                    )
                }
            >
                Create homepage
            </Button>
        </Stack>
    );
};

// ts-unused-exports:disable-next-line
export const HomepageBuilderPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const [searchParams, setSearchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const [editorEpoch, setEditorEpoch] = useState(0);
    const selectedHomepageUuid = searchParams.get('homepage') ?? undefined;
    const isCreating = searchParams.get('create') === '1';
    const { user } = useApp();
    const { isEnabled: isFlagEnabled, isLoading: isFlagLoading } =
        useHomepageBuilderFlag();
    const homepage = useHomepageForBuilder(projectUuid, {
        enabled: isFlagEnabled && !isCreating,
        homepageUuid: selectedHomepageUuid,
    });
    const homepages = useProjectHomepages(projectUuid, {
        enabled: isFlagEnabled,
    });

    const canManage =
        user.data?.ability?.can(
            'manage',
            subject('ProjectHomepage', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    // Wait for a fresh fetch: the editor snapshots the draft on mount, so
    // seeding it from a stale cache would autosave old state over the server
    if (
        isFlagLoading ||
        (isFlagEnabled && !isCreating && !homepage.isFetchedAfterMount)
    ) {
        return <PageSpinner />;
    }

    if (!isFlagEnabled || !canManage || !projectUuid) {
        return <ForbiddenPanel />;
    }

    const openHomepage = (created: ProjectHomepage) =>
        setSearchParams({ homepage: created.homepageUuid });

    if (isCreating || !homepage.data) {
        return (
            <Page withFixedContent withPaddedContent>
                <CreateHomepageForm
                    projectUuid={projectUuid}
                    homepages={homepages.data ?? []}
                    onCreated={openHomepage}
                    onCancel={
                        isCreating && (homepages.data ?? []).length > 0
                            ? () => setSearchParams({})
                            : null
                    }
                />
            </Page>
        );
    }

    return (
        <Page>
            {
                <HomepageEditor
                    key={`${homepage.data.homepageUuid}-${editorEpoch}`}
                    homepage={homepage.data}
                    projectUuid={projectUuid}
                    homepages={homepages.data ?? []}
                    onSwitchHomepage={(homepageUuid) =>
                        setSearchParams({ homepage: homepageUuid })
                    }
                    onCreateNew={() => setSearchParams({ create: '1' })}
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
            }
        </Page>
    );
};
