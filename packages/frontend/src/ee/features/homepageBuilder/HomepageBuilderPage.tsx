import { subject } from '@casl/ability';
import { type HomepageConfig } from '@lightdash/common';
import {
    Box,
    Button,
    Group,
    Stack,
    Text,
    TextInput,
    Title,
} from '@mantine-8/core';
import { useDebouncedValue } from '@mantine/hooks';
import { IconArrowLeft, IconCircleCheck, IconSend } from '@tabler/icons-react';
import MDEditor from '@uiw/react-md-editor';
import { useEffect, useState, type FC } from 'react';
import { useNavigate, useParams } from 'react-router';
import MantineIcon from '../../../components/common/MantineIcon';
import Page from '../../../components/common/Page/Page';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import {
    useCreateHomepage,
    useHomepageBuilderFlag,
    useHomepageForBuilder,
    usePublishHomepage,
    useUpdateHomepageDraft,
} from './hooks/useProjectHomepage';

// ts-unused-exports:disable-next-line
export const HomepageBuilderPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const navigate = useNavigate();
    const { user } = useApp();
    const { isEnabled: isFlagEnabled, isLoading: isFlagLoading } =
        useHomepageBuilderFlag();
    const homepage = useHomepageForBuilder(projectUuid, {
        enabled: isFlagEnabled,
    });
    const createMutation = useCreateHomepage(projectUuid!);
    const updateMutation = useUpdateHomepageDraft(
        projectUuid!,
        homepage.data?.homepageUuid,
    );
    const publishMutation = usePublishHomepage(
        projectUuid!,
        homepage.data?.homepageUuid,
    );

    const [newName, setNewName] = useState('');
    const [content, setContent] = useState<string | null>(null);
    const [debouncedContent] = useDebouncedValue(content, 800);

    const serverContent =
        homepage.data?.draftConfig.rows[0]?.blocks[0]?.config.content;

    useEffect(() => {
        if (content === null && serverContent !== undefined) {
            setContent(serverContent);
        }
    }, [content, serverContent]);

    const homepageData = homepage.data;
    useEffect(() => {
        if (
            debouncedContent === null ||
            !homepageData ||
            debouncedContent === serverContent
        ) {
            return;
        }
        const firstRow = homepageData.draftConfig.rows[0];
        const draftConfig: HomepageConfig = {
            version: 1,
            rows: [
                {
                    id: firstRow?.id ?? 'row-1',
                    blocks: [
                        {
                            id: firstRow?.blocks[0]?.id ?? 'block-1',
                            type: 'markdown',
                            config: { content: debouncedContent },
                        },
                    ],
                },
            ],
        };
        updateMutation.mutate({ draftConfig });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [debouncedContent]);

    const canManage =
        user.data?.ability?.can(
            'manage',
            subject('ProjectHomepage', {
                organizationUuid: user.data?.organizationUuid,
                projectUuid,
            }),
        ) ?? false;

    if (isFlagLoading || homepage.isInitialLoading) {
        return <PageSpinner />;
    }

    if (!isFlagEnabled || !canManage) {
        return <ForbiddenPanel />;
    }

    return (
        <Page withFixedContent withPaddedContent>
            <Stack gap="lg" maw={920} mx="auto" w="100%">
                <Group justify="space-between">
                    <Button
                        variant="default"
                        leftSection={<MantineIcon icon={IconArrowLeft} />}
                        onClick={() =>
                            navigate(`/projects/${projectUuid}/home`)
                        }
                    >
                        Exit
                    </Button>
                    {homepage.data && (
                        <Group gap="sm">
                            {updateMutation.isLoading ? (
                                <Text size="xs" c="dimmed">
                                    Saving…
                                </Text>
                            ) : (
                                <Group gap={4}>
                                    <MantineIcon
                                        icon={IconCircleCheck}
                                        color="green"
                                    />
                                    <Text size="xs" c="dimmed">
                                        Draft saved
                                    </Text>
                                </Group>
                            )}
                            <Button
                                leftSection={<MantineIcon icon={IconSend} />}
                                loading={publishMutation.isLoading}
                                onClick={() => publishMutation.mutate()}
                            >
                                Publish
                            </Button>
                        </Group>
                    )}
                </Group>

                {!homepage.data ? (
                    <Stack gap="sm" maw={480}>
                        <Title order={3}>Create a homepage</Title>
                        <Text c="dimmed" size="sm">
                            Curate what everyone in this project sees when they
                            land in Lightdash.
                        </Text>
                        <TextInput
                            label="Name"
                            placeholder="e.g. Team homepage"
                            value={newName}
                            onChange={(e) => setNewName(e.currentTarget.value)}
                        />
                        <Button
                            disabled={newName.trim().length === 0}
                            loading={createMutation.isLoading}
                            onClick={() =>
                                createMutation.mutate({ name: newName.trim() })
                            }
                        >
                            Create homepage
                        </Button>
                    </Stack>
                ) : (
                    <Box data-color-mode="light">
                        <MDEditor
                            value={content ?? ''}
                            onChange={(value) => setContent(value ?? '')}
                            preview="edit"
                            minHeight={220}
                            height={420}
                            visibleDragbar
                        />
                    </Box>
                )}
            </Stack>
        </Page>
    );
};
