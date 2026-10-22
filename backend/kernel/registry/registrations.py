"""Port of kernel/registry/registrations.ts. Same kinds, same order, same relationship specs.

Order matters: it is the order entities are loaded in, and (inside one entity) the order its
relationships are emitted, exactly as in TypeScript.
"""

from schemas import (
    DatasetFrontmatter,
    ExperimentFrontmatter,
    HypothesisFrontmatter,
    KnowledgeFrontmatter,
    PresentationFrontmatter,
    ProgramFrontmatter,
    PublicationFrontmatter,
    QuestionFrontmatter,
    SoftwareFrontmatter,
)

from .types import EntityRegistration, RelationshipFieldSpec

REGISTRATIONS: tuple[EntityRegistration, ...] = (
    EntityRegistration(
        "program", "content/programs", ProgramFrontmatter,
        (RelationshipFieldSpec("relatedQuestionSlugs", "many", "question"),),
    ),
    EntityRegistration(
        "question", "content/questions", QuestionFrontmatter,
        (RelationshipFieldSpec("programSlug", "one", "program"),),
    ),
    EntityRegistration(
        "hypothesis", "content/hypotheses", HypothesisFrontmatter,
        (RelationshipFieldSpec("questionSlug", "one", "question"),),
    ),
    EntityRegistration(
        "experiment", "content/experiments", ExperimentFrontmatter,
        (
            RelationshipFieldSpec("questionSlug", "one", "question"),
            RelationshipFieldSpec("hypothesisSlug", "one", "hypothesis"),
        ),
    ),
    EntityRegistration(
        "note", "content/notes", KnowledgeFrontmatter,
        (RelationshipFieldSpec("programSlug", "one", "program"),),
    ),
    EntityRegistration("software", "content/software", SoftwareFrontmatter),
    EntityRegistration("publication", "content/publications", PublicationFrontmatter),
    EntityRegistration("dataset", "content/datasets", DatasetFrontmatter),
    EntityRegistration(
        "presentation", "content/presentations", PresentationFrontmatter,
        (
            RelationshipFieldSpec("programSlug", "one", "program"),
            RelationshipFieldSpec("questionSlug", "one", "question"),
        ),
    ),
)
