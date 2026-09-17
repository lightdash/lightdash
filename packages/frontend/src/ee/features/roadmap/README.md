# Lightdash roadmap

The roadmap displays projects and organization-specific tickets in a board or table. The frontend reads this data through the Lightdash backend, which checks roadmap access and calls Lightdash Control Center using the instance license and the authenticated organization. Control Center provides the project catalog and organization-specific interest.

Users with the organization-level `manage:Roadmap` permission can request to follow projects; admins have this permission by default. When a user submits a request, the frontend sends their note to the backend. The backend adds the authenticated user and organization details before forwarding the request to Control Center. Control Center handles the interest request and notifies the Lightdash team; some requests require manual follow-up.

After a successful submission, the frontend confirms receipt and refreshes the roadmap. Following state comes from server reads, and following a project does not grant access to additional tickets.

Slack thread links appear on cards, table rows, and in item details when supplied by Control Center. Project links belong to direct project requests; ticket links remain on their tickets. Responses without `slackThreadUrls` default to an empty array for compatibility.

Roadmap response schemas accept and discard additional properties, including nested fields, so additive Control Center changes do not break reads. Known fields are still validated, and request/query schemas remain strict.
