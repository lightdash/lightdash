# Roles and permissions

* Everybody in your organization will join as an `Organization Member` by default unless specified.
* All organization members can create their own projects and will be the Project Admin for that project.

## Project Roles

Project Admins can invite users to their project and assign the following roles. Note that projects may also be 
accessible by users with organization roles.

| Action                                  | Project Admin | Project Editor | Project Viewer |
|:----------------------------------------|:-------------:|:--------------:|:--------------:|
| View charts and dashboards              |       ✅       |       ✅        |       ✅        |
| Run metric queries                      |       ✅       |       ✅        |       ✅        |
| Create/edit charts and dashboards       |       ✅       |       ✅        |       ❌        |    
| Use the SQL runner                      |       ✅       |       ✅        |       ❌        |
| Invite users to project                 |       ✅       |       ❌        |       ❌        |
| Manage project access and permissions   |       ✅       |       ❌        |       ❌        |
| Delete project                          |       ✅       |       ❌        |       ❌        |

## Organization Roles

Organization Admins can assign roles to organization members, which gives access to all projects in the organization.

| Action                                     | Organization Admin | Organization Editor | Organization Viewer | Organization Member |
|:-------------------------------------------|:------------------:|:-------------------:|:-------------------:|:-------------------:|
| Create Personal access tokens              |         ✅          |          ✅          |          ✅          |          ✅          |
| Invite users to organization               |         ✅          |          ✅          |          ✅          |          ✅          |
| Create new projects                        |         ✅          |          ✅          |          ✅          |          ✅          |   
| View **all** projects                      |         ✅          |          ✅          |          ✅          |          ❌          |
| Edit **all** projects                      |         ✅          |          ✅          |          ❌          |          ❌          |
| Admin for **all** projects                 |         ✅          |          ❌          |          ❌          |          ❌          |
| Manage organization access and permissions |         ✅          |          ❌          |          ❌          |          ❌          |

## Space Roles

Space permissions are inherited from a user's project permissions. For example, if I'm a project viewer, I will get `viewer` access to a Space.

| Action                                                   | Spaces Admin | Spaces Editor | Spaces Viewer |
|:---------------------------------------------------------|:------------:|:-------------:|:-------------:|
| Edit a Space's access (from Full to Restricted)          |      ✅       |       ✅      |       ❌      |
| Invite users to a Restricted Space they have access to   |      ✅       |       ✅      |       ❌      |
| Remove users from a Restricted Space they have access to |      ✅       |       ✅      |       ❌      |
| Add/Remove content from the Space                        |      ✅       |       ✅      |       ❌      |
| Edit the Space details (name, description, etc.)         |      ✅       |       ✅      |       ❌      |
