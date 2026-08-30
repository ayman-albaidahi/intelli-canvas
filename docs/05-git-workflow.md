# IntelliCanvas — Git & GitHub Workflow

## 1. Purpose

This document defines the Git and GitHub workflow used by the IntelliCanvas development team.

The goal is to ensure:

* Organized development
* Safe collaboration
* Clear ownership of tasks
* Traceable changes
* Code review
* Consistent commit history
* Easy project tracking

GitHub will be used as the central platform for source code, issues, documentation, project planning, and collaboration.

---

# 2. Repository

The main repository is:

```text
intelli-canvas
```

The repository is initially private during development.

It may be changed to public after the project reaches a stable and documented release.

---

# 3. Repository Structure

The repository will contain:

```text
intelli-canvas/
│
├── README.md
├── LICENSE
├── .gitignore
│
├── docs/
│
├── backend/
├── frontend/
│
└── tests/
```

---

# 4. Branch Strategy

The project will use the following main branches:

```text
main
  │
  └── develop
        │
        ├── feature/*
        ├── fix/*
        ├── refactor/*
        └── docs/*
```

---

## 4.1 Main Branch

`main` contains stable versions of the project.

Rules:

* No direct development on `main`.
* Changes should be merged through Pull Requests.
* Only tested and reviewed code should reach `main`.
* Releases will be created from stable states of `main`.

---

## 4.2 Develop Branch

`develop` is the main integration branch during active development.

Features are merged into `develop` after review and testing.

```text
feature
   ↓
Pull Request
   ↓
Code Review
   ↓
Testing
   ↓
develop
```

---

# 5. Feature Branches

Every feature should have its own branch.

Naming convention:

```text
feature/<short-description>
```

Examples:

```text
feature/image-upload
feature/canvas-manager
feature/crop-tool
feature/brightness-control
feature/layer-system
feature/background-removal
```

A feature branch should be created from the latest `develop` branch.

---

# 6. Bug Fix Branches

Bug fixes should use:

```text
fix/<short-description>
```

Examples:

```text
fix/image-upload-validation
fix/canvas-scaling
fix/rotation-calculation
fix/export-quality
```

---

# 7. Refactoring Branches

For code restructuring without changing functionality:

```text
refactor/<short-description>
```

Examples:

```text
refactor/image-service
refactor/api-structure
refactor/canvas-manager
```

---

# 8. Documentation Branches

Documentation changes should use:

```text
docs/<short-description>
```

Examples:

```text
docs/update-readme
docs/api-documentation
docs/architecture
```

---

# 9. Issue-Driven Development

Development tasks should be tracked using GitHub Issues.

Before starting a feature:

```text
Requirement
    ↓
GitHub Issue
    ↓
Branch
    ↓
Implementation
```

Example:

```text
FR-006 — Crop
        ↓
Issue #15
        ↓
feature/crop-tool
```

This allows every feature to be traced back to a documented requirement.

---

# 10. Issue Structure

Each important Issue should contain:

* Title
* Description
* Objective
* Requirements
* Acceptance Criteria
* Related documentation
* Assignee
* Priority
* Labels

Example:

```text
Title:
Implement Image Crop Tool

Description:
Implement an interactive crop tool that allows users
to select a rectangular region of the image and apply
the crop operation.

Acceptance Criteria:

- User can activate crop mode.
- User can select a crop region.
- Crop region can be adjusted.
- User can confirm or cancel the crop.
- The resulting image preserves the expected dimensions.
- The operation can be undone.
```

---

# 11. Commit Convention

Commits should follow a consistent format.

The project will use:

```text
feat:
fix:
refactor:
docs:
test:
chore:
```

---

## 11.1 Feature Commit

```text
feat: add image upload endpoint
```

## 11.2 Bug Fix

```text
fix: validate unsupported image formats
```

## 11.3 Refactoring

```text
refactor: separate image processing services
```

## 11.4 Documentation

```text
docs: update architecture documentation
```

## 11.5 Testing

```text
test: add crop service tests
```

## 11.6 Maintenance

```text
chore: update project dependencies
```

---

# 12. Commit Guidelines

Commits should be:

* Small
* Focused
* Descriptive
* Related to one logical change

Avoid large commits containing unrelated changes.

Bad example:

```text
update everything
```

Better:

```text
feat: implement image upload validation
```

---

# 13. Pull Requests

Every significant feature should be merged through a Pull Request.

Workflow:

```text
Feature Branch
      ↓
Push to GitHub
      ↓
Create Pull Request
      ↓
Code Review
      ↓
Testing
      ↓
Approval
      ↓
Merge
```

---

# 14. Pull Request Requirements

A Pull Request should include:

* Summary of changes
* Related Issue
* Implementation details
* Testing performed
* Known limitations
* Screenshots when UI changes are involved

Example:

```text
Closes #15

Summary:
Implemented the interactive crop tool.

Changes:
- Added crop tool UI.
- Added crop selection logic.
- Added crop API integration.
- Added undo support.

Testing:
- Tested PNG and JPEG images.
- Tested different image dimensions.
- Tested cancel operation.
```

---

# 15. Code Review

At least one other team member should review important Pull Requests before merging.

The reviewer should check:

* Correctness
* Code quality
* Architecture
* Naming
* Error handling
* Security
* Performance
* Tests
* Documentation

The goal of code review is not only to find errors but also to share knowledge between team members.

---

# 16. Merging

After review and testing:

```text
feature branch
      ↓
develop
```

When a stable release is ready:

```text
develop
      ↓
main
```

The team should avoid merging unfinished features into `main`.

---

# 17. Synchronizing With Develop

Before starting or continuing work, developers should synchronize their branch with the latest `develop`.

General workflow:

```text
Update local repository
        ↓
Update develop
        ↓
Update feature branch
        ↓
Continue development
```

Developers should regularly synchronize their branches to reduce merge conflicts.

---

# 18. GitHub Issues and Roadmap

The project roadmap is documented in:

```text
docs/03-features-roadmap.md
```

Requirements are documented in:

```text
docs/02-requirements.md
```

Issues should reference the relevant requirements and roadmap items whenever possible.

Relationship:

```text
Requirement
     ↓
Roadmap
     ↓
Milestone
     ↓
Issue
     ↓
Branch
     ↓
Pull Request
     ↓
Commit
```

---

# 19. GitHub Project Board

The project will use a GitHub Project Board with the following workflow:

```text
Backlog
   ↓
Ready
   ↓
In Progress
   ↓
Review
   ↓
Testing
   ↓
Done
```

Each active task should have a corresponding Issue.

---

# 20. Labels

The following labels should be used where appropriate:

### Type

```text
feature
bug
refactor
documentation
testing
architecture
```

### Area

```text
frontend
backend
image-processing
database
api
ui
```

### Priority

```text
priority: high
priority: medium
priority: low
```

---

# 21. Milestones

The project will use milestones based on the roadmap:

```text
v0.1 — Foundation
v0.2 — Core Editor
v0.3 — Drawing & Objects
v0.4 — Image Processing
v0.5 — Layers & Compositing
v0.6 — Background Studio
v0.7 — History & Processing Pipeline
v0.8 — Image Intelligence
v0.9 — Polish & Testing
v1.0 — Final Release
```

---

# 22. Releases

Stable project versions will be represented using GitHub Releases.

Examples:

```text
v0.1.0
v0.2.0
v0.3.0
...
v1.0.0
```

Each release should include:

* Version number
* Main changes
* Important features
* Known issues
* Documentation status

---

# 23. Documentation Workflow

Important project decisions should be documented.

Documentation may include:

* Project vision
* Requirements
* Architecture
* API design
* Development decisions
* Team roles
* Development progress
* Testing results

Documentation changes should also be committed to GitHub.

---

# 24. Development Log

Major development activities should be recorded in:

```text
docs/07-development-log.md
```

A development log entry may contain:

```text
Date:
Developer:
Task:
Changes:
Problems:
Decisions:
Next Step:
```

This provides a historical record of project development.

---

# 25. Secrets and Sensitive Data

The following must never be committed to GitHub:

* API keys
* Passwords
* Tokens
* Secret keys
* `.env` files containing secrets
* Personal credentials
* Private configuration

Sensitive configuration should be stored using environment variables.

---

# 26. Generated Files

Generated files and temporary data should not normally be committed.

Examples:

```text
__pycache__/
*.pyc
.env
.venv/
backend/storage/uploads/*
backend/storage/processed/*
backend/database/*.db
```

These should be handled through `.gitignore`.

---

# 27. Team Collaboration Principle

The team should follow this principle:

> One task, one Issue, one branch, one Pull Request.

This makes the project easier to understand, review, and maintain.

---

# 28. Final Workflow

The complete development workflow is:

```text
                    Requirement
                         │
                         ▼
                    GitHub Issue
                         │
                         ▼
                  Assign Team Member
                         │
                         ▼
                    Create Branch
                         │
                         ▼
                    Development
                         │
                         ▼
                      Commit
                         │
                         ▼
                       Push
                         │
                         ▼
                  Pull Request
                         │
                         ▼
                    Code Review
                         │
                         ▼
                      Testing
                         │
                         ▼
                 Merge into Develop
                         │
                         ▼
                  Integration Testing
                         │
                         ▼
                  Stable Release
                         │
                         ▼
                  Merge into Main
                         │
                         ▼
                  GitHub Release
```

---

# 29. Core Principle

GitHub is not only a code repository for IntelliCanvas.

It is the central project management and documentation system.

The project should maintain a traceable relationship between:

```text
What we planned
      ↓
What we implemented
      ↓
Who implemented it
      ↓
How it was reviewed
      ↓
How it was tested
      ↓
When it became part of the project
```

This workflow will be followed throughout the development of IntelliCanvas.
