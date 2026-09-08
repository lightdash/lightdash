import { assertUnreachable, type SshTunnelStage } from '@lightdash/common';

export type SshClientError = Error & {
    level?: string;
    code?: string;
    errors?: Error[];
};

// Node's happy-eyeballs connect surfaces a refused port as an AggregateError
// with an empty message, so fall back to the inner errors or the code.
export const sshClientErrorMessage = (error: SshClientError): string => {
    if (error.message) return error.message;
    const inner = (error.errors ?? [])
        .map((e) => e.message)
        .filter((m) => m.length > 0);
    if (inner.length > 0) return inner.join('; ');
    return error.code ?? 'connection failed';
};

const RESOLVE_CODES = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EAI_FAIL']);

export type SshConnectionProgress = {
    tcpConnected: boolean;
    handshakeCompleted: boolean;
};

// The TCP connect is ours, so anything before it is resolve or tcp. After it,
// ssh2 tags errors with a level, and whether the handshake event fired
// separates handshake from auth.
export const classifySshClientError = (
    error: SshClientError,
    { tcpConnected, handshakeCompleted }: SshConnectionProgress,
): SshTunnelStage => {
    if (error.code && RESOLVE_CODES.has(error.code)) return 'resolve';
    if (!tcpConnected) return 'tcp';
    if (handshakeCompleted) return 'auth';
    if (error.level === 'client-authentication') return 'auth';
    if (/authentication methods failed/i.test(error.message)) return 'auth';
    return 'handshake';
};

export type SshTunnelFailureContext = {
    stage: SshTunnelStage;
    sshHost: string;
    sshPort: number;
    sshUser: string;
    databaseHost: string;
    databasePort: number;
    staticIp: string | null;
    cause: string;
};

export const describeSshTunnelFailure = ({
    stage,
    sshHost,
    sshPort,
    sshUser,
    databaseHost,
    databasePort,
    staticIp,
    cause,
}: SshTunnelFailureContext): string => {
    const from = staticIp ? ` from Lightdash (${staticIp})` : '';
    const allow = staticIp
        ? `Allow inbound SSH from ${staticIp} in the bastion's security group or firewall.`
        : "Allow inbound SSH from Lightdash's IP in the bastion's security group or firewall.";
    switch (stage) {
        case 'resolve':
            return `The SSH host "${sshHost}" does not resolve to an address. Check the SSH Remote Host for typos and make sure it is a public hostname or IP. (${cause})`;
        case 'tcp':
            return `Could not reach ${sshHost} on port ${sshPort}${from}. ${allow} (${cause})`;
        case 'handshake':
            return `Reached ${sshHost}:${sshPort} but nothing answered as an SSH server. Check that sshd is listening on that port and that a firewall is not dropping the session after connect. (${cause})`;
        case 'auth':
            return `The bastion ${sshHost} rejected the key for user "${sshUser}". Add the public key shown above to ~/.ssh/authorized_keys for that user on the bastion, and check the user exists and the file is mode 600. (${cause})`;
        case 'forward':
            return `Connected to the bastion, but it could not open a connection to ${databaseHost}:${databasePort}. Either AllowTcpForwarding is off in the bastion's sshd_config, or the bastion cannot reach the database endpoint. Check the database's security group allows the bastion on port ${databasePort}. (${cause})`;
        default:
            return assertUnreachable(stage, 'Unknown SSH tunnel stage');
    }
};
