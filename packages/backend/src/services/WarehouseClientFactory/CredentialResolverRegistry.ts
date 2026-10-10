import {
    ParameterError,
    UnexpectedServerError,
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from '@lightdash/common';
import { toDbtTarget } from '../../dbt/targets';
import {
    credentialResolution,
    preparedCredentials,
    type CredentialResolver,
    type CredentialSaveInput,
    type CredentialSelection,
    type DbtTargetPolicy,
    type DbtTargetResult,
    type MaterializedCredential,
    type MaterializedCredentials,
    type PreparedCredentials,
    type ValidatedCredential,
} from './CredentialResolver';

type CredentialsFor<T extends WarehouseTypes> = Extract<
    CreateWarehouseCredentials,
    { type: T }
>;
type Dispatcher = {
    resolve: (
        selection: CredentialSelection<CreateWarehouseCredentials, unknown>,
    ) => Promise<MaterializedCredentials>;
    validateOnSave: (
        input: CredentialSaveInput<CreateWarehouseCredentials, unknown>,
    ) => Promise<ValidatedCredential<CreateWarehouseCredentials, unknown>>;
};

export class CredentialResolverRegistry {
    private readonly transportedResolutions =
        new WeakSet<MaterializedCredential>();

    private readonly resolvers = new Map<string, Dispatcher>();

    register<T extends WarehouseTypes, S = CredentialsFor<NoInfer<T>>>(
        warehouseType: T,
        authMode: string,
        resolver: CredentialResolver<CredentialsFor<NoInfer<T>>, S>,
    ): void {
        const key = `${warehouseType}:${authMode}`;
        if (this.resolvers.has(key))
            throw new UnexpectedServerError(
                'A credential resolver is already registered for this authentication mode',
            );
        this.resolvers.set(key, this.dispatcher(resolver));
    }

    private readonly transports: {
        matches: (credentials: CreateWarehouseCredentials) => boolean;
        resolver: Dispatcher;
    }[] = [];

    registerTransport<C extends CreateWarehouseCredentials>(
        matches: (
            credentials: CreateWarehouseCredentials,
        ) => credentials is NoInfer<C>,
        resolver: CredentialResolver<C>,
    ): void {
        this.transports.push({ matches, resolver: this.dispatcher(resolver) });
    }

    private dispatcher<C extends CreateWarehouseCredentials, S>(
        resolver: CredentialResolver<C, S>,
    ): Dispatcher {
        return {
            resolve: async (selection) => {
                const typedSelection = selection as CredentialSelection<C, S>;
                const resolved = await resolver.resolve(typedSelection);
                let disposal: Promise<void> | null = null;
                return {
                    ...resolved.clientCredentials,
                    [credentialResolution]: {
                        toDbtTarget: (finalConnection, policy) =>
                            resolver.toDbtTarget(
                                resolved,
                                finalConnection as C,
                                policy,
                            ),
                        agentSignIn: resolved.agentSignIn,
                        clientOptions: resolved.clientOptions,
                        cacheable: resolved.cacheable,
                        cacheKeyIdentity: resolver.cacheKeyIdentity(
                            typedSelection,
                            resolved,
                        ),
                        dispose: () => {
                            disposal ??= resolver.dispose(resolved);
                            return disposal;
                        },
                    },
                };
            },
            validateOnSave: (input) =>
                resolver.validateOnSave(input as CredentialSaveInput<C, S>),
        };
    }

    private get(
        credentials: CreateWarehouseCredentials,
        mode:
            | 'connection'
            | 'ai_service_account'
            | 'agent_identity' = 'connection',
    ): Dispatcher | undefined {
        if (mode !== 'connection') {
            const resolver = this.resolvers.get(`${credentials.type}:${mode}`);
            if (!resolver)
                throw new ParameterError(
                    mode === 'agent_identity'
                        ? 'This warehouse does not support agent sign-in.'
                        : 'This warehouse does not support an AI service account.',
                );
            return resolver;
        }
        return 'authenticationType' in credentials &&
            credentials.authenticationType !== undefined
            ? this.resolvers.get(
                  `${credentials.type}:${credentials.authenticationType}`,
              )
            : undefined;
    }

    toDbtTarget(
        credentials: MaterializedCredentials,
        finalConnection: CreateWarehouseCredentials,
        policy: DbtTargetPolicy,
    ): DbtTargetResult {
        const resolution = credentials[credentialResolution];
        return resolution
            ? resolution.toDbtTarget(finalConnection, policy)
            : toDbtTarget(finalConnection, policy);
    }

    has(credentials: CreateWarehouseCredentials): boolean {
        return (
            this.get(credentials) !== undefined ||
            this.transports.some(({ matches }) => matches(credentials))
        );
    }

    async validateOnSave<S>(
        input: CredentialSaveInput<CreateWarehouseCredentials, S>,
        mode: 'ai_service_account' | 'agent_identity',
    ): Promise<ValidatedCredential<CreateWarehouseCredentials, S>>;
    async validateOnSave(
        input: CredentialSaveInput<CreateWarehouseCredentials>,
        mode?: 'connection',
    ): Promise<ValidatedCredential<CreateWarehouseCredentials>>;
    async validateOnSave(
        input: CredentialSaveInput<CreateWarehouseCredentials, unknown>,
        mode:
            | 'connection'
            | 'ai_service_account'
            | 'agent_identity' = 'connection',
    ): Promise<ValidatedCredential<CreateWarehouseCredentials, unknown>> {
        const resolver = this.get(input.connection, mode);
        const validated = resolver
            ? await resolver.validateOnSave(input)
            : { connection: input.connection, stored: input.stored };
        const transport =
            mode === 'connection'
                ? this.transports.find(({ matches }) =>
                      matches(validated.connection),
                  )
                : undefined;
        return transport
            ? transport.resolver.validateOnSave({ ...input, ...validated })
            : validated;
    }

    async resolveCredentialSelection<S>(
        selection: CredentialSelection<CreateWarehouseCredentials, S>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
        mode: 'ai_service_account' | 'agent_identity',
    ): Promise<MaterializedCredentials>;
    async resolveCredentialSelection(
        selection: CredentialSelection<CreateWarehouseCredentials>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
        mode?: 'connection',
    ): Promise<MaterializedCredentials>;
    async resolveCredentialSelection(
        selection: CredentialSelection<CreateWarehouseCredentials, unknown>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
        mode:
            | 'connection'
            | 'ai_service_account'
            | 'agent_identity' = 'connection',
    ): Promise<MaterializedCredentials> {
        const materialized = (selection.connection as MaterializedCredentials)[
            credentialResolution
        ];
        if (
            materialized &&
            (this.transportedResolutions.has(materialized) ||
                !this.transports.some(({ matches }) =>
                    matches(selection.connection),
                ))
        )
            return selection.connection;
        const { [preparedCredentials]: prepared, ...unprepared } =
            selection.connection as PreparedCredentials;
        const resolver =
            prepared || materialized
                ? undefined
                : this.get(selection.connection, mode);
        let credentials: MaterializedCredentials;
        if (materialized) credentials = selection.connection;
        else if (resolver) credentials = await resolver.resolve(selection);
        else if (prepared) credentials = unprepared;
        else credentials = await legacyResolve();
        const transport = this.transports.find(({ matches }) =>
            matches(credentials),
        );
        if (!transport) return credentials;
        const { [credentialResolution]: modeResolution, ...connection } =
            credentials;
        const transported = await transport.resolver.resolve({
            ...selection,
            connection,
        });
        const resolved = transported[credentialResolution]!;
        let disposal: Promise<void> | null = null;
        const result: MaterializedCredentials = {
            ...transported,
            [credentialResolution]: {
                toDbtTarget:
                    modeResolution?.toDbtTarget ?? resolved.toDbtTarget,
                agentSignIn: modeResolution?.agentSignIn ?? null,
                clientOptions: {
                    ...modeResolution?.clientOptions,
                    ...resolved.clientOptions,
                },
                cacheable:
                    (modeResolution?.cacheable ?? true) && resolved.cacheable,
                cacheKeyIdentity: [
                    ...(modeResolution?.cacheKeyIdentity ?? []),
                    ...resolved.cacheKeyIdentity,
                ],
                dispose: () => {
                    disposal ??= (async () => {
                        try {
                            await resolved.dispose();
                        } finally {
                            await modeResolution?.dispose();
                        }
                    })();
                    return disposal;
                },
            },
        };
        this.transportedResolutions.add(result[credentialResolution]!);
        return result;
    }
}
