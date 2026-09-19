"""The single registry of image operations the API exposes.

Before this module existed, one operation was defined in four unrelated places:
the pure function in ``process_operations``, a wrapper method in
``ProcessService``, a branch in ``PipelineExecutionService._apply``, and (for
two operations) an entry in ``operation_service.REGISTRY``. Adding an
operation meant editing all four, and they had already drifted apart — the
pipeline accepted brightness values the direct API rejected.

Every operation now lives here exactly once, as an :class:`OperationSpec` that
pairs the URL slug, the history label, the parameter validator, and the pixel
transform. The pipeline and the REST routes both dispatch through
:data:`OPERATIONS`, so a new entry is open for extension without touching the
consumers (open/closed) and the contract cannot drift between entry points
(single source of truth).

``histogram`` is registered but is not an image-producing operation; see
``OperationSpec.produces_image``.
"""
