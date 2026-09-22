# Ownership migration policy

PR #2 introduces project ownership. Every project must reference a user through `projects.owner_id`, and every image session inherits ownership through `image_sessions.project_id`.

## Legacy records

Projects created before ownership was introduced are assigned to the internal user:

```text
user_id: system-owner
email: system-owner@internal.invalid
is_active: 0
```

The account is intentionally inactive and cannot log in. It exists only as a non-interactive owner that preserves existing project, image-session, history, layer, asset, and pipeline records without exposing them to ordinary users.

The migration is idempotent. On startup, the repository creates the system owner if it is missing, adds or rebuilds the `projects.owner_id` column as a non-null foreign key, and assigns every null or empty legacy owner to `system-owner`. An index is created on `projects.owner_id`.

## New records

New image uploads require an authenticated user. If no `project_id` is supplied, the Backend creates a new project owned by the authenticated user. If a `project_id` is supplied, it must belong to that authenticated user; otherwise the request returns `404 RESOURCE_NOT_FOUND`. Any `owner_id` supplied by the client is ignored. Ownership is derived only from the authenticated session.

## Future access control

PR #2 provides the ownership model and repository resolvers. PR #3 will apply those resolvers to every resource route and add the complete IDOR test matrix. Until PR #3 is merged, existing resource routes must not be considered fully protected for multi-user production use.
