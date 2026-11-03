# Organization warehouse credentials removal

The backend CRUD endpoints, CLI option and organization credential resolution
paths are retired, following the earlier UI and feature-flag removal.

Projects and extra warehouse connections use their own credentials. Personal
sign-ins, service accounts and existing preview credential inheritance keep their
current behavior. Requests or stored connections with a retired organization
credential reference fail explicitly instead of using inline credentials.

There are no schema changes or data migrations. Legacy storage, secret rotation
coverage and shared compatibility types remain. Older callers of the removed
endpoints receive 404 and must configure credentials directly on each project.
