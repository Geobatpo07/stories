"""Build-pipeline errors, in the style of kernel/errors: name the files, name the problem, say how
to fix it."""


class DuplicateEntityError(Exception):
    """Two source files resolve to the same entity id (`<kind>:<slug>`).

    The TypeScript Kernel does not detect this (its id map silently keeps the last entity), and no
    check in the shipped TypeScript build pipeline does either. The Python pipeline refuses to
    build instead of dropping one of the two records.
    """

    def __init__(self, entity_id: str, first_path: str, second_path: str) -> None:
        self.entity_id = entity_id
        self.first_path = first_path
        self.second_path = second_path
        super().__init__(
            f'Duplicate entity "{entity_id}": defined in both "{first_path}" and "{second_path}". '
            "Each kind + slug must be unique: change the `slug` in one of the two files "
            "(or delete the one you no longer want)."
        )
