# Lightdash roadmap

The roadmap displays projects and organization-specific tickets in a board or table. The frontend reads this data through the Lightdash backend, which checks roadmap access and calls Lightdash Control Center using the instance license and the authenticated organization. Control Center provides the project catalog and organization-specific interest.

When an organization admin requests to follow a project, the frontend sends their note to the backend. The backend adds the authenticated user and organization details before forwarding the request to Control Center. Control Center handles the interest request and notifies the Lightdash team; some requests require manual follow-up.

After a successful submission, the frontend confirms receipt and refreshes the roadmap. Following state comes from server reads, and following a project does not grant access to additional tickets.
