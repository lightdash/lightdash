import {
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
        selection: CredentialSelection<CreateWarehouseCredentials>,
    ) => Promise<MaterializedCredentials>;
    validateOnSave: (
        input: CredentialSaveInput<CreateWarehouseCredentials>,
    ) => Promise<ValidatedCredential<CreateWarehouseCredentials>>;
};

export class CredentialResolverRegistry {
    private readonly resolvers = new Map<string, Dispatcher>();

    register<T extends WarehouseTypes>(
        warehouseType: T,
        authMode: string,
        resolver: CredentialResolver<CredentialsFor<NoInfer<T>>>,
    ): void {
        const key = `${warehouseType}:${authMode}`;
        if (this.resolvers.has(key))
            throw new UnexpectedServerError(
                'A credential resolver is already registered for this authentication mode',
            );
        this.resolvers.set(key, {
            resolve: async (selection) => {
                const typedSelection = selection as CredentialSelection<
                    CredentialsFor<T>
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
                    input as CredentialSaveInput<CredentialsFor<T>>,
                ),
        });
    }

    private get(
        credentials: CreateWarehouseCredentials,
    ): Dispatcher | undefined {
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

    async validateOnSave(
        input: CredentialSaveInput<CreateWarehouseCredentials>,
    ): Promise<ValidatedCredential<CreateWarehouseCredentials>> {
        const resolver = this.get(input.connection);
        return resolver
            ? resolver.validateOnSave(input)
            : { connection: input.connection, stored: input.stored };
    }

    async resolveCredentialSelection(
        selection: CredentialSelection<CreateWarehouseCredentials>,
        legacyResolve: () => Promise<CreateWarehouseCredentials>,
    ): Promise<MaterializedCredentials> {
        if (
            (selection.connection as MaterializedCredentials)[
                credentialResolution
            ]
        )
            return selection.connection;
        const resolver = this.get(selection.connection);
        return resolver ? resolver.resolve(selection) : legacyResolve();
    }
}
