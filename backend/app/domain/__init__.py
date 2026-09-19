"""Domain model for the image-processing pipeline.

Services historically returned free-floating ``dict[str, Any]`` values, so a
typo in a key surfaced only at runtime and internal bookkeeping (notably the
absolute ``path`` of a rendered file) had to be stripped by hand at every
route. These dataclasses give the compiler a chance to help and make the
public/private split a property of the type rather than a filter each endpoint
 remembers to apply.
"""
