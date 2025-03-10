import { Controller, Middlewares } from '@tsoa/runtime';
import { sentrySetProjectUuidTagMiddleware } from '../middlewares/sentry';
import type { ServiceRepository } from '../services/ServiceRepository';

/**
 * Extends tsoa's Controller with additional Lightdash-specific logic.
 */
@Middlewares(sentrySetProjectUuidTagMiddleware)
export class BaseController extends Controller {
    // TODO: This is currently just a placeholder layer over Controller.
    constructor(protected readonly services: ServiceRepository) {
        super();
    }
}
