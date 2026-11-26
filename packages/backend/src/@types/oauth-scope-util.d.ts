declare module '@node-oauth/oauth2-server/lib/utils/scope-util' {
    export function parseScope(
        requestedScope: string | null | undefined,
    ): string[] | undefined;
}
