import { type LightdashConfig } from '../config/parseConfig';
import { EncryptionUtil } from './EncryptionUtil/EncryptionUtil';

/**
 * Interface outlining all utils. Add new utils to
 * this list (in alphabetical order, please!).
 */

export type UtilManifest = {
    encryptionUtil: EncryptionUtil;
};

/**
 * Enforces the presence of getter methods for all utils declared in the manifest.
 */
type UtilFactoryMethod<T extends UtilManifest> = {
    [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type UtilProvider<T extends UtilManifest> = (providerArgs: {
    repository: UtilRepository;
}) => T[keyof T];

/**
 * Structure for describing util providers:
 *
 *   <utilName> -> providerMethod
 */
export type UtilProviderMap<T extends UtilManifest = UtilManifest> = Partial<{
    [K in keyof T]: UtilProvider<T>;
}>;

/**
 * Intermediate abstract class used to enforce util factory methods via the `UtilFactoryMethod`
 * type. We need this extra thin layer to ensure we are statically aware of all members.
 */
abstract class UtilRepositoryBase {
    /**
     * Container for util provider overrides. Providers can be defined when instancing
     * the util repository, and take precedence when instancing the given util.
     *
     * Providers receive an instance of the current OperationContext, and the parent
     * UtilRepository instance.
     *
     * new UtilRepository({
     *    utilProviders: {
     *      encryptionUtil: ({ repository, context }) => {
     *          return new EncryptionUtilOverride(...);
     *      }
     *    }
     * })
     *
     * NOTE: This exact implementation is temporary, and is likely to be adjusted soon
     * as part of the dependency injection rollout.
     */
    protected providers: UtilProviderMap;

    protected readonly lightdashConfig: LightdashConfig;

    constructor({
        utilProviders,
        lightdashConfig,
    }: {
        utilProviders?: UtilProviderMap<UtilManifest>;
        lightdashConfig: LightdashConfig;
    }) {
        this.providers = utilProviders ?? {};
        this.lightdashConfig = lightdashConfig;
    }
}

/**
 * Bare util repository class, which acts as a container for all existing
 * utils, and as a point to share instantiation and common logic.
 *
 * If you need to access a util, you should do it through an instance of this
 * repository - ideally one that you accessed through a controller, or otherwise
 * via dependency injection.
 *
 */
export class UtilRepository
    extends UtilRepositoryBase
    implements UtilFactoryMethod<UtilManifest>
{
    /**
     * Holds memoized instances of utils after their initial instantiation:
     */
    protected utilInstances: Partial<UtilManifest> = {};

    public getEncryptionUtil(): EncryptionUtil {
        return this.getUtil(
            'encryptionUtil',
            () => new EncryptionUtil({ lightdashConfig: this.lightdashConfig }),
        );
    }

    /**
     * Handles initializing a util, and taking into account util
     * providers + memoization.
     *
     * If a factory is not provided, and a util provider is not defined,
     * this method throws an error. This should not happen in normal operation.
     */
    private getUtil<K extends keyof UtilManifest, T extends UtilManifest[K]>(
        utilName: K,
        factory?: () => T,
    ): T {
        if (this.utilInstances[utilName] == null) {
            let utilInstance: T;

            if (this.providers[utilName] != null) {
                utilInstance = this.providers[utilName]!({
                    repository: this,
                }) as T;
            } else if (factory != null) {
                utilInstance = factory();
            } else {
                throw new Error(
                    `Unable to initialize util '${utilName}' - no factory or provider.`,
                );
            }

            this.utilInstances[utilName] = utilInstance;
        }

        return this.utilInstances[utilName] as T;
    }
}
