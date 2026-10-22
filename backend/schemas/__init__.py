from .common import IsoDate, NonEmptyStr, Slug, Tag, Url
from .content_status import CONTENT_STATUSES, ContentStatus
from .content_type import CONTENT_TYPES, ContentType
from .dataset import DatasetFrontmatter
from .experiment import ExperimentFrontmatter
from .frontmatter import BaseFrontmatter
from .hypothesis import HypothesisFrontmatter
from .knowledge import KNOWLEDGE_OBJECT_TYPES, KnowledgeFrontmatter, KnowledgeObjectType
from .presentation import PresentationFrontmatter
from .program import ProgramFrontmatter
from .publication import PublicationFrontmatter
from .question import QuestionFrontmatter
from .software import SoftwareFrontmatter

# Directory name under domain/ -> model. (`knowledge` is the `note` content type.)
DOMAIN_MODELS: dict[str, type[BaseFrontmatter]] = {
    "dataset": DatasetFrontmatter,
    "experiment": ExperimentFrontmatter,
    "hypothesis": HypothesisFrontmatter,
    "knowledge": KnowledgeFrontmatter,
    "presentation": PresentationFrontmatter,
    "program": ProgramFrontmatter,
    "publication": PublicationFrontmatter,
    "question": QuestionFrontmatter,
    "software": SoftwareFrontmatter,
}
