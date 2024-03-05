import { Controller, type IocContainerFactory } from '@tsoa/runtime';
import { BaseController } from '../controllers/baseController';
import type { ServiceRepository } from './ServiceRepository';
import { serviceRepository } from './services';

/**
 * For now, we allow both classes extending tsoa's Controller directly, as well as those
 * extending Lightdash's `BaseController`, and handle both cases accordingly.
 */
type TsoaControllerKlass = new () => Controller;
type BaseControllerKlass = new (
    repository: ServiceRepository,
) => BaseController;
type RouteControllerKlass = TsoaControllerKlass | BaseControllerKlass;

/**
 * Used to narrow the controller klass type, so that we can instantiate it with
 * the correct number of arguments.
 */
const isBaseControllerCtor = (
    ctor: RouteControllerKlass,
): ctor is BaseControllerKlass => ctor.prototype instanceof BaseController;

/**
 * See tsoa.yml
 *
 * Override's tsoa's native controller instantiation, and allows us to manage controller
 * instantiation directly.
 */
export const iocContainer: IocContainerFactory = () => ({
    async get<T extends RouteControllerKlass>(Ctor: T) {
        if (isBaseControllerCtor(Ctor)) {
            return new Ctor(serviceRepository);
        }

        return new (Ctor as TsoaControllerKlass)();
    },
});
