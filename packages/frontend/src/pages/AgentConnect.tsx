import { FeatureFlags } from '@lightdash/common';
import { Anchor, Box, Stack } from '@mantine/core';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router';
import { validate as isUuid } from 'uuid';
import { DocumentTitle } from '../components/common/DocumentTitle';
import SuboptimalState from '../components/common/SuboptimalState/SuboptimalState';
import LightdashLogo from '../components/LightdashLogo/LightdashLogo';
import useHealth from '../hooks/health/useHealth';
import { useServerFeatureFlag } from '../hooks/useServerOrClientFeatureFlag';

const getRedirectTarget = (
    redirect: string | null,
    siteUrl: string,
): string => {
    if (redirect) {
        try {
            const url = new URL(redirect, siteUrl);
            const isSiteHost = url.host === new URL(siteUrl).host;
            const isLoopback =
                url.protocol === 'http:' &&
                /^http:\/\/(localhost|127\.0\.0\.1):\d+(?:[/?#]|$)/i.test(
                    redirect,
                );
            if (
                !url.username &&
                !url.password &&
                ['http:', 'https:'].includes(url.protocol) &&
                (isSiteHost || isLoopback)
            ) {
                if (isLoopback) return redirect;
                return redirect.startsWith('/') && !redirect.startsWith('//')
                    ? `${url.pathname}${url.search}${url.hash}`
                    : url.href;
            }
        } catch {
            return '/agent-connected';
        }
    }
    return '/agent-connected';
};

const AgentConnect = () => {
    const [searchParams] = useSearchParams();
    const { data: health } = useHealth();
    const flag = useServerFeatureFlag(FeatureFlags.AgentIdentity);
    const project = searchParams.get('project');
    const entryPoint = searchParams.get('entryPoint');
    const hasValidProject = project !== null && isUuid(project);
    const siteUrl = health?.siteUrl;
    const target = siteUrl
        ? getRedirectTarget(searchParams.get('redirect'), siteUrl)
        : '/agent-connected';
    const enabled = flag.data?.enabled === true;

    useEffect(() => {
        if (enabled && hasValidProject && siteUrl) {
            const params = new URLSearchParams({ redirect: target, project });
            if (entryPoint !== null) params.set('entryPoint', entryPoint);
            window.location.assign(
                `${siteUrl}/api/v1/login/snowflake-ai?${params}`,
            );
        }
    }, [enabled, hasValidProject, siteUrl, target, project, entryPoint]);

    const explanation = !hasValidProject
        ? 'This agent connection link is missing a valid project.'
        : !flag.isInitialLoading && !enabled
          ? 'Agent sign-in is not available for your account.'
          : null;

    return (
        <>
            <DocumentTitle title="Agent connection" />
            <Stack>
                <Box mx="auto" my="lg">
                    <LightdashLogo />
                </Box>
                {explanation ? (
                    <SuboptimalState
                        title="Agent connection unavailable."
                        description={explanation}
                        action={
                            <Anchor
                                component={Link}
                                to={
                                    enabled
                                        ? '/generalSettings/myAgentConnections'
                                        : '/generalSettings/myWarehouseConnections'
                                }
                            >
                                {enabled
                                    ? 'My agent identity'
                                    : 'My warehouse connections'}
                            </Anchor>
                        }
                    />
                ) : (
                    <SuboptimalState title="Connecting your agent…" loading />
                )}
            </Stack>
        </>
    );
};

export default AgentConnect;
