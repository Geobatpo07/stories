"""Errors of the publication path. All of them surface to the Studio as the route's 422 `error`."""


class PublicationConfigurationError(RuntimeError):
    """GitHub publishing is not configured (no token / repository). Raised before any request."""


class PublicationValidationError(ValueError):
    """The content tree with the change applied does not build. Raised before any GitHub write.

    The message keeps the TypeScript shape (`Publication validation failed.\\n<report>`).
    """


class GitHubApiError(RuntimeError):
    def __init__(self, action: str, status: int, detail: str) -> None:
        self.status = status
        super().__init__(f"GitHub {action} failed ({status}): {detail}")


class PublicationConflictError(RuntimeError):
    """The branch moved while publishing. Nothing was published; retrying is safe."""
