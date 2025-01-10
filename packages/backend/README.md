# Backend

Table of contents:

## Getting started

This package shouldn't be run directly. Instead, you should follow the instruction from
the [Setup development environment](../../.github/CONTRIBUTING.md#setup-development-environment)
section from the contribution file.

## Key technologies/libraries

- [Node.js](https://nodejs.org/en/)
- [Express](https://expressjs.com/)
- [Knex](http://knexjs.org/)
- [PostgreSQL](https://www.postgresql.org/)

## Architecture

**Overview**

- ~~routers~~ (legacy)
- controllers
- services
- models
- database
    - migrations
    - seeds
    - entities
- clients
- projectAdapters
- dbt

### ~~Routers~~

Legacy folder. Should be refactored to controllers.

### Controllers

Controllers are responsible for handling the request and response from the API. They should
be as thin as possible, delegating the business logic to services.

When making changes to a controller or the types used in a controller, you should also generate the
corresponding HOA files. You can do it by running `yarn generate-api`.

Guidelines:

- Should call 1 service action per endpoint
- Define params and body type with HOA definitions

Restrictions:

- Can only import services

### Services

Services are responsible for handling the business logic and tracking. They tend to be the biggest and most complex part
of the backend.

Guidelines:

- add tracking to all public methods
- add permission checks to all public methods

Restrictions:

- Cannot import controllers, and other services
- Can import models, clients and projectAdapters

### Models

Models are responsible for handling the database logic. They should be as thin as possible.

Guidelines:

- `get` methods should error if there are no results
- `find` methods should NOT error if there are no results
- `create` and `update` methods should return the created entity uuid
- should only use static methods from other models

Restrictions:

- Can only import entities and use other models

### Database

#### Entities

Entities are responsible for typing the latest database schema.

#### Migrations

Migrations are responsible for handling the database schema changes.

Guidelines:

- they should not export constants or functions beside the `up` and `down` methods

Restrictions:

- Can't import anything

Useful Development Scripts:

- migrate database - `yarn workspace backend migrate`
- rollback database - `yarn workspace backend rollback`
- rollback last migration - `yarn workspace backend rollback-last`
- create a new migration file - `yarn workspace backend create-migration <migration-name>`

#### Seeds

Seeds are responsible for populating the database with initial data.
This data is used for development and testing purposes.

### Clients

Clients are responsible for handling the communication with external services.

Restrictions:

- Can't import anything

### Project adapters

Project adapters are responsible for handling the communication with external services with the intent to fetch dbt
project files.

Restrictions:

- Can't import anything

### dbt

dbt is responsible for handling the communication with dbt.

Restrictions:

- Can't import anything

