import { ModelRepository } from '../models/ModelRepository';
import { SchedulerClient } from '../scheduler/SchedulerClient';
import { type OperationContext } from '../services/ServiceRepository';
import { S3Client } from './Aws/s3';
import { S3CacheClient } from './Aws/S3CacheClient';
import CubeClient from './cube/CubeClient';
import DbtCloudGraphqlClient from './dbtCloud/DbtCloudGraphqlClient';
import EmailClient from './EmailClient/EmailClient';
import { GoogleDriveClient } from './Google/GoogleDriveClient';
import { SlackClient } from './Slack/SlackClient';

/**
 * Interface outlining all clients. Add new clients to
 * this list (in alphabetical order, please!).
 */

export interface ClientManifest {
    dbtCloudGraphqlClient: DbtCloudGraphqlClient;
    cubeClient: CubeClient;
    emailClient: EmailClient;
    googleDriveClient: GoogleDriveClient;
    s3CacheClient: S3CacheClient;
    s3Client: S3Client;
    schedulerClient: SchedulerClient;
    slackClient: SlackClient;
}

/**
 * Enforces the presence of getter methods for all clients declared in the manifest.
 */
type ClientFactoryMethod<T extends ClientManifest> = {
    [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type ClientProvider<T extends ClientManifest> = (providerArgs: {
    repository: ClientRepository;
    context: OperationContext;
    models: ModelRepository;
}) => T[keyof T];

/**
 * Structure for describing client providers:
 *
 *   <clientName> -> providerMethod
 */
export type ClientProviderMap<T extends ClientManifest = ClientManifest> =
    Partial<{
        [K in keyof T]: ClientProvider<T>;
    }>;

/**
 * Intermediate abstract class used to enforce client factory methods via the `ClientFactoryMethod`
 * type. We need this extra thin layer to ensure we are statically aware of all members.
 */
abstract class ClientRepositoryBase {
    /**
     * Container for client provider overrides. Providers can be defined when instancing
     * the client repository, and take precedence when instancing the given client.
     *
     * Providers receive an instance of the current OperationContext, and the parent
     * ClientRepository instance.
     *
     * new ClientRepository({
     *    clientProviders: {
     *      encryptionClient: ({ repository, context }) => {
     *          return new EncryptionClientOverride(...);
     *      }
     *    }
     * })
     *
     * NOTE: This exact implementation is temporary, and is likely to be adjusted soon
     * as part of the dependency injection rollout.
     */
    protected providers: ClientProviderMap;

    /**
     * See @type OperationContext
     */
    protected readonly context: OperationContext;

    protected models: ModelRepository;

    constructor({
        clientProviders,
        context,
        models,
    }: {
        clientProviders?: ClientProviderMap<ClientManifest>;
        context: OperationContext;
        models: ModelRepository;
    }) {
        this.providers = clientProviders ?? {};
        this.context = context;
        this.models = models;
    }
}

/**
 * Bare client repository class, which acts as a container for all existing
 * clients, and as a point to share instantiation and common logic.
 *
 * If you need to access a client, you should do it through an instance of this
 * repository - ideally one that you accessed through a controller, or otherwise
 * via dependency injection.
 *
 */
export class ClientRepository
    extends ClientRepositoryBase
    implements ClientFactoryMethod<ClientManifest>
{
    /**
     * Holds memoized instances of clients after their initial instantiation:
     */
    protected clientInstances: Partial<ClientManifest> = {};

    public getDbtCloudGraphqlClient(): DbtCloudGraphqlClient {
        return this.getClient(
            'dbtCloudGraphqlClient',
            () =>
                new DbtCloudGraphqlClient({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getCubeClient(): CubeClient {
        return this.getClient(
            'cubeClient',
            () =>
                new CubeClient({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getEmailClient(): EmailClient {
        return this.getClient(
            'emailClient',
            () =>
                new EmailClient({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getGoogleDriveClient(): GoogleDriveClient {
        return this.getClient(
            'googleDriveClient',
            () =>
                new GoogleDriveClient({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getS3CacheClient(): S3CacheClient {
        return this.getClient(
            's3CacheClient',
            () =>
                new S3CacheClient({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getS3Client(): S3Client {
        return this.getClient(
            's3Client',
            () =>
                new S3Client({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getSchedulerClient(): SchedulerClient {
        return this.getClient(
            'schedulerClient',
            () =>
                new SchedulerClient({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    schedulerModel: this.models.getSchedulerModel(),
                }),
        );
    }

    public getSlackClient(): SlackClient {
        return this.getClient(
            'slackClient',
            () =>
                new SlackClient({
                    lightdashConfig: this.context.lightdashConfig,
                    slackAuthenticationModel:
                        this.models.getSlackAuthenticationModel(),
                }),
        );
    }

    /**
     * Handles initializing a client, and taking into account client
     * providers + memoization.
     *
     * If a factory is not provided, and a client provider is not defined,
     * this method throws an error. This should not happen in normal operation.
     */
    private getClient<
        K extends keyof ClientManifest,
        T extends ClientManifest[K],
    >(clientName: K, factory?: () => T): T {
        if (this.clientInstances[clientName] == null) {
            let clientInstance: T;

            if (this.providers[clientName] != null) {
                clientInstance = this.providers[clientName]!({
                    repository: this,
                    context: this.context,
                    models: this.models,
                }) as T;
            } else if (factory != null) {
                clientInstance = factory();
            } else {
                throw new Error(
                    `Unable to initialize client '${clientName}' - no factory or provider.`,
                );
            }

            this.clientInstances[clientName] = clientInstance;
        }

        return this.clientInstances[clientName] as T;
    }
}
