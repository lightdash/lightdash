import { Controller } from '@tsoa/runtime';
import type { ServiceRepository } from '../services/ServiceRepository';

/**
 * Extends tsoa's Controller with additional Lightdash-specific logic.
 */
export class BaseController extends Controller {
    // TODO: This is currently just a placeholder layer over Controller.
    constructor(protected readonly serviceRepository: ServiceRepository) {
        super();
    }
}
