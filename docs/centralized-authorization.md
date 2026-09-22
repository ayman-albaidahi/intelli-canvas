# Centralized route authorization

PR #3 applies ownership checks to every route that reads or mutates an image session. The check runs before the route accesses image files, history, layers, pipeline state, analysis data, suggestions, or background processing.

The authorization decorator resolves `image_id` from a path parameter, query string, form field, or JSON body. It requires an active authenticated session, resolves the session through the project owner, and stores the authorized session in Flask request context. A second decorator applies the same image ownership check to layer assets and then verifies the asset belongs to that image.

Anonymous requests return `401 AUTH_REQUIRED`. An unknown image keeps the existing `404 IMAGE_SESSION_NOT_FOUND` contract. An image that exists but belongs to another authenticated user returns `404 RESOURCE_NOT_FOUND`; the same behavior applies to cross-owner layer assets. The owner is always derived from the authentication cookie. Client-supplied `owner_id` values are not used for authorization.

The public health, capabilities, authentication, static-file, and operation-explanation endpoints remain outside image ownership checks because they do not access a user-owned image. Shared background uploads require authentication, while catalog and thumbnail reads remain public.

The authorization regression suite covers anonymous access, cross-owner reads and mutations, image content, exports, layers, layer assets, pipeline, history, processing, analysis, suggestions, and background operations. The tests also verify that unknown image identifiers preserve the existing API error contract.
