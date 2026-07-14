import { subject } from '@casl/ability';
import { Button, Stack, Text, TextInput, Title } from '@mantine-8/core';
import { useState, type FC } from 'react';
import { useParams } from 'react-router';
import Page from '../../../components/common/Page/Page';
import ForbiddenPanel from '../../../components/ForbiddenPanel';
import PageSpinner from '../../../components/PageSpinner';
import useApp from '../../../providers/App/useApp';
import { HomepageEditor } from './HomepageEditor';
import {
    useCreateHomepage,
    useHomepageBuilderFlag,
    useHomepageForBuilder,
} from './hooks/useProjectHomepage';

// ts-unused-exports:disable-next-line
export const HomepageBuilderPage: FC = () => {
    const { projectUuid } = useParams<{ projectUuid: string }>();
    const { user } = useApp();
    const { isEnabled: isFlagEnabled, isLoading: isFlagLoading } =
        useHomepageBuilderFlag();
    const homepage = useHomepageForBuilder(projectUuid, {
        enabled: isFlagEnabled,
    });
    const createMutation = useCreateHomepage(projectUuid!);
    const [newName, setNewName] = useState('');

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

    if (!isFlagEnabled || !canManage || !projectUuid) {
        return <ForbiddenPanel />;
    }

    return (
        <Page withFixedContent withPaddedContent>
            {!homepage.data ? (
                <Stack gap="sm" maw={480}>
                    <Title order={3}>Create a homepage</Title>
                    <Text c="dimmed" size="sm">
                        Curate what everyone in this project sees when they land
                        in Lightdash.
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
                <HomepageEditor
                    key={homepage.data.homepageUuid}
                    homepage={homepage.data}
                    projectUuid={projectUuid}
                />
            )}
        </Page>
    );
};
