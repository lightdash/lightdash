import {
    ParameterError,
    UnexpectedServerError,
    type CreateWarehouseCredentials,
    type WarehouseTypes,
} from '@lightdash/common';
import {
    credentialResolution,
    type CredentialResolver,
    type CredentialSaveInput,
    type CredentialSelection,
    type MaterializedCredentials,
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
        this.resolvers.set(key, {
            resolve: async (selection) => {
                const typedSelection = selection as CredentialSelection<
                    CredentialsFor<T>,
                    S
                >;
                const resolved = await resolver.resolve(typedSelection);
                let disposal: Promise<void> | null = null;
                return {
                    ...resolved.clientCredentials,
                    [credentialResolution]: {
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
                resolver.validateOnSave(
                    input as CredentialSaveInput<CredentialsFor<T>, S>,
                ),
        });
    }

    private get(
        credentials: CreateWarehouseCredentials,
        mode: 'connection' | 'ai_service_account' = 'connection',
    ): Dispatcher | undefined {
        if (mode === 'ai_service_account') {
            const resolver = this.resolvers.get(
                `${credentials.type}:ai_service_account`,
            );
            if (!resolver)
                throw new ParameterError(
                    'This warehouse does not support an AI service account.',
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

    has(credentials: CreateWarehouseCredentials): boolean {
        return this.get(credentials) !== undefined;
    }

    async validateOnSave<S>(
        input: CredentialSaveInput<CreateWarehouseCredentials, S>,
        mode: 'ai_service_account',
    ): Promise<ValidatedCredential<CreateWarehouseCredentials, S>>;
    async validateOnSave(
        input: CredentialSaveInput<CreateWarehouseCredentials>,
        mode?: 'connection',
    ): Promise<ValidatedCredential<CreateWarehouseCredentials>>;
    async validateOnSave(
        input: CredentialSaveInput<CreateWarehouseCredentials, unknown>,
        mode: 'connection' | 'ai_service_account' = 'connection',
    ): Promise<ValidatedCredential<CreateWarehouseCredentials, unknown>> {
        const resolver = this.get(input.connection, mode);
        return resolver
            ? resolver.validateOnSave(input)
            : { connection: input.connection, stored: input.stored };
    }

    async resolveCredentialSelection<S>(
        selection: CredentialSelection<CreateWarehouseCredentials, S>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
        mode: 'ai_service_account',
    ): Promise<MaterializedCredentials>;
    async resolveCredentialSelection(
        selection: CredentialSelection<CreateWarehouseCredentials>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
        mode?: 'connection',
    ): Promise<MaterializedCredentials>;
    async resolveCredentialSelection(
        selection: CredentialSelection<CreateWarehouseCredentials, unknown>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
        mode: 'connection' | 'ai_service_account' = 'connection',
    ): Promise<MaterializedCredentials> {
        if (
            (selection.connection as MaterializedCredentials)[
                credentialResolution
            ]
        )
            return selection.connection;
        const resolver = this.get(selection.connection, mode);
        return resolver ? resolver.resolve(selection) : legacyResolve();
    }
}
