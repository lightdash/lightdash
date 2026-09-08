import {
    SSH_TUNNEL_STAGES,
    type SshTunnelStage,
    type WarehouseConnectionHop,
    type WarehouseConnectionTestResults,
} from '@lightdash/common';

export const tunnelHopsAllOk = (): WarehouseConnectionHop[] =>
    SSH_TUNNEL_STAGES.map((stage) => ({ stage, status: 'ok', message: null }));

// Hops before the failing stage passed, the failing one carries the message,
// everything after it never ran.
export const tunnelHopsFailedAt = (
    failedStage: SshTunnelStage,
    message: string,
): WarehouseConnectionHop[] => {
    const failedIndex = SSH_TUNNEL_STAGES.indexOf(failedStage);
    return SSH_TUNNEL_STAGES.map((stage, index) => {
        if (index < failedIndex) return { stage, status: 'ok', message: null };
        if (index === failedIndex) return { stage, status: 'failed', message };
        return { stage, status: 'skipped', message: null };
    });
};

export const buildConnectionTestResults = (
    hops: WarehouseConnectionHop[],
): WarehouseConnectionTestResults => ({
    ok: hops.every((hop) => hop.status === 'ok'),
    hops,
});
