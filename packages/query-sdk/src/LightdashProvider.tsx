/**
 * React context provider for the Lightdash client.
 *
 * Usage:
 *   const lightdash = createClient({ apiKey, baseUrl, projectUuid })
 *   <LightdashProvider client={lightdash}>
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { type LightdashClient } from './client';
import type { Transport } from './types';

type LightdashContextValue = {
    client: LightdashClient | null;
    transport: Transport;
};

const LightdashContext = createContext<LightdashContextValue | null>(null);

export function useTransport(): Transport {
    const ctx = useContext(LightdashContext);
    if (!ctx) {
        throw new Error(
            'useLightdash must be used inside <LightdashProvider>. ' +
                'Wrap your app in <LightdashProvider client={...}>.',
        );
    }
    return ctx.transport;
}

export function useLightdashClient(): LightdashClient | null {
    const ctx = useContext(LightdashContext);
    return ctx?.client ?? null;
}

type LightdashProviderProps = {
    children: ReactNode;
} & (
    | { client: LightdashClient; transport?: never }
    | { transport: Transport; client?: never }
);

export function LightdashProvider({
    children,
    ...props
}: LightdashProviderProps) {
    const client = ('client' in props ? props.client : null) ?? null;
    const transport =
        client?.transport ??
        ('transport' in props ? props.transport : null) ??
        null;

    const value = useMemo<LightdashContextValue>(() => {
        if (!transport) {
            throw new Error(
                'LightdashProvider requires either a client or transport prop.',
            );
        }
        return { client, transport };
    }, [client, transport]);

    return (
        <LightdashContext.Provider value={value}>
            {children}
        </LightdashContext.Provider>
    );
}
