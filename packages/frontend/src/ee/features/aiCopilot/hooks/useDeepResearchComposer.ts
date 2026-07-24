import { useCallback, useEffect, useRef, useState } from 'react';
import { isDeepResearchMcpServerReady } from '../deepResearch/mcpServerReady';
import { type StartDeepResearchArgs } from '../deepResearch/types';
import { useAgentAiMcpServers } from './useProjectAiMcpServers';

type Args = {
    projectUuid?: string;
    agentUuid?: string;
    canStart: boolean;
    enabled: boolean;
    onStart?: (args: StartDeepResearchArgs) => Promise<void>;
};

export const useDeepResearchComposer = ({
    projectUuid,
    agentUuid,
    canStart,
    enabled,
    onStart,
}: Args) => {
    const [selectedMcpServerUuids, setSelectedMcpServerUuids] = useState<
        string[]
    >([]);
    const initializedSelectionKeyRef = useRef<string | null>(null);
    const [isStarting, setIsStarting] = useState(false);
    const mcpServersQuery = useAgentAiMcpServers(projectUuid, agentUuid, {
        enabled,
    });
    const selectionKey =
        projectUuid && agentUuid ? `${projectUuid}:${agentUuid}` : null;

    useEffect(() => {
        if (!selectionKey) {
            initializedSelectionKeyRef.current = null;
            setSelectedMcpServerUuids([]);
            return;
        }
        if (
            !mcpServersQuery.data ||
            initializedSelectionKeyRef.current === selectionKey
        ) {
            return;
        }
        initializedSelectionKeyRef.current = selectionKey;
        setSelectedMcpServerUuids(
            mcpServersQuery.data.map((server) => server.uuid),
        );
    }, [selectionKey, mcpServersQuery.data]);

    const hasUnavailableSelection = (mcpServersQuery.data ?? []).some(
        (server) =>
            selectedMcpServerUuids.includes(server.uuid) &&
            !isDeepResearchMcpServerReady(server),
    );
    const isPreflightReady =
        !selectionKey ||
        (initializedSelectionKeyRef.current === selectionKey &&
            !mcpServersQuery.isLoading &&
            !mcpServersQuery.isError &&
            !hasUnavailableSelection);

    const startDeepResearch = useCallback(
        async (args: StartDeepResearchArgs): Promise<boolean> => {
            if (!onStart || !canStart || !isPreflightReady || isStarting) {
                return false;
            }

            setIsStarting(true);
            try {
                await onStart(args);
                return true;
            } catch {
                // The start mutation owns user-facing error reporting. Keep the
                // prompt in the composer so the user can retry.
                return false;
            } finally {
                setIsStarting(false);
            }
        },
        [canStart, isPreflightReady, isStarting, onStart],
    );

    return {
        isPreflightReady,
        isStarting,
        mcpServerError:
            mcpServersQuery.error?.error.message ??
            (mcpServersQuery.isError
                ? 'Could not check MCP connections.'
                : null),
        mcpServers: mcpServersQuery.data ?? [],
        isLoadingMcpServers: mcpServersQuery.isLoading,
        selectedMcpServerUuids,
        setSelectedMcpServerUuids,
        startDeepResearch,
    };
};
