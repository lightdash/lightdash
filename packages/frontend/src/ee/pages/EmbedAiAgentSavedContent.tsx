import { type ApiError, type EmbedUrl } from '@lightdash/common';
import { Center, Loader } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { lightdashApi } from '../../api';
import SuboptimalState from '../../components/common/SuboptimalState/SuboptimalState';
import useEmbed from '../providers/Embed/useEmbed';
import { useUiStrings } from '../providers/Embed/useUiStrings';

const EmbedAiAgentSavedContent = () => {
    const { projectUuid, agentUuid, contentType, contentUuidOrSlug } =
        useParams();
    const { embedToken } = useEmbed();
    const { search } = useLocation();
    const getUiString = useUiStrings();
    const valid = !!(
        embedToken &&
        projectUuid &&
        agentUuid &&
        contentUuidOrSlug &&
        (contentType === 'chart' || contentType === 'dashboard')
    );
    const { data, error } = useQuery<EmbedUrl, ApiError>({
        queryKey: [
            'ai-agent-saved-content-url',
            projectUuid,
            agentUuid,
            contentType,
            contentUuidOrSlug,
            embedToken,
        ],
        queryFn: () =>
            lightdashApi<EmbedUrl>({
                url: `/projects/${projectUuid}/aiAgents/${agentUuid}/saved-content/${contentType}/${encodeURIComponent(contentUuidOrSlug!)}/embed-url`,
                method: 'POST',
                sensitive: true,
                body: undefined,
            }),
        enabled: valid,
        retry: false,
        cacheTime: 0,
    });

    useEffect(() => {
        if (!data) return;
        const destination = new URL(data.url);
        const parameters = new URLSearchParams(search);
        for (const key of ['theme', 'backgroundColor', 'timezone']) {
            const value = parameters.get(key);
            if (value !== null) destination.searchParams.set(key, value);
        }
        // A new document isolates the read-only token from the agent's token.
        window.location.replace(destination.href);
    }, [data, search]);

    return (
        <Center h="100vh">
            {!valid || error ? (
                <SuboptimalState
                    title={getUiString('aiAgent.savedContent.openError')}
                    description={error?.error.message}
                />
            ) : (
                <Loader />
            )}
        </Center>
    );
};

export default EmbedAiAgentSavedContent;
