import type { DirectAccessResourceType } from '@lightdash/common';
import type { ResourceAccessHandler } from './ResourceAccessHandler';

export class DirectAccessService {
    constructor(
        private readonly handlers: Record<
            DirectAccessResourceType,
            ResourceAccessHandler
        >,
    ) {}

    getHandler(resourceType: DirectAccessResourceType): ResourceAccessHandler {
        return this.handlers[resourceType];
    }
}
