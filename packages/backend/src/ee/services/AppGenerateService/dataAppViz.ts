import {
    isChartTypeIcon,
    type DataAppViz,
    type DataAppVizSchema,
} from '@lightdash/common';
import { type DbApp } from '../../../database/entities/apps';

export const mapDataAppViz = (
    app: DbApp & { viz_schema: DataAppVizSchema | null },
): DataAppViz => ({
    dataAppVizUuid: app.app_id,
    slug: app.slug,
    name: app.name,
    description: app.description,
    projectUuid: app.project_uuid,
    spaceUuid: app.space_uuid,
    schema: app.viz_schema,
    createdAt: app.created_at,
    createdByUserUuid: app.created_by_user_uuid,
    registrySlug: app.registry_slug,
    icon: isChartTypeIcon(app.icon) ? app.icon : null,
});
