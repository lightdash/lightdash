import { Controller, type IocContainerFactory } from '@tsoa/runtime';
import { BaseController } from '../controllers/baseController';
import { ServiceRepository } from './ServiceRepository';

/**
 * For now, we allow both classes extending tsoa's Controller directly, as well as those
 * extending Lightdash's `BaseController`, and handle both cases accordingly.
 */
type TsoaControllerKlass = new () => Controller;
type BaseControllerKlass = new (
    serviceRepository: ServiceRepository,
) => BaseController;
type RouteControllerKlass = TsoaControllerKlass | BaseControllerKlass;

/**
 * Used to narrow the controller klass type, so that we can instantiate it with
 * the correct number of arguments.
 */
const isTsoaControllerCtor = (
    ctor: RouteControllerKlass,
): ctor is TsoaControllerKlass => ctor.prototype instanceof Controller;

/**
 * See tsoa.yml
 *
 * Override's tsoa's native controller instantiation, and allows us to manage controller
 * instantiation directly.
 */
export const iocContainer: IocContainerFactory = () => ({
    async get<T extends RouteControllerKlass>(Ctor: T) {
        if (isTsoaControllerCtor(Ctor)) {
            return new Ctor();
        }

        return new Ctor(new ServiceRepository());
    },
});
