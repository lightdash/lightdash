# Organization warehouse credentials removal

Removes the deprecated organization warehouse credentials settings page, selector,
API endpoints, CLI option, feature flag, and runtime credential source.

Projects and extra warehouse connections use their own credentials. Personal
credentials, service accounts, and existing preview flows remain unchanged.
There are no schema changes or data migrations. Legacy storage and compatibility
types remain untouched.
