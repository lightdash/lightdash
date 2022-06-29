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
| Create/edit metrics                     |       ✅       |       ✅        |       ❌        |
| Run SQL queries                         |       ✅       |       ✅        |       ❌        |
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
