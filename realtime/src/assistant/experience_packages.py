"""
Experience Package Registry — defines the mapping from #hashtag to skill + card + prompt patch.

Each Experience Package bundles:
- skill: agent-facing instructions (system prompt patch, output format)
- card: frontend-facing template info
- hashtag: the trigger command (e.g., "#search")
"""

from dataclasses import dataclass, field


@dataclass
class SkillDef:
    name: str
    description: str
    system_prompt_patch: str
    output_format: str = "general"


@dataclass
class CardDef:
    template: str
    layout: str = "default"


@dataclass
class ExperiencePackage:
    id: str
    label: str
    hashtag: str
    skill: SkillDef
    card: CardDef
    icon: str = ""
    contextual: bool = False  # True = AI-injected, not in default bar


# ─── Default Experience Packages (always in intent bar) ───────────────

EP_SEARCH = ExperiencePackage(
    id="search",
    label="Search",
    hashtag="#search",
    icon="🔍",
    skill=SkillDef(
        name="visual_search",
        description="Search for information about what's visible",
        system_prompt_patch=(
            "You are in Search mode. Identify the subject in the image and "
            "provide structured knowledge: name, category, key facts, and "
            "related topics. Return as a knowledge card."
        ),
        output_format="knowledge_card",
    ),
    card=CardDef(template="knowledge_card", layout="full"),
)

EP_IDENTIFY = ExperiencePackage(
    id="identify",
    label="Identify",
    hashtag="#identify",
    icon="🔬",
    skill=SkillDef(
        name="visual_identify",
        description="Identify species, objects, landmarks",
        system_prompt_patch=(
            "You are in Identify mode. Determine what the object/species/"
            "landmark is. Provide: name, taxonomy/category, key distinguishing "
            "features, confidence level. Return as an identification card."
        ),
        output_format="identification_card",
    ),
    card=CardDef(template="identification_card", layout="full"),
)

EP_TRANSLATE = ExperiencePackage(
    id="translate",
    label="Translate",
    hashtag="#translate",
    icon="🌐",
    skill=SkillDef(
        name="visual_translate",
        description="Detect and translate visible text",
        system_prompt_patch=(
            "You are in Translate mode. Extract all visible text using OCR, "
            "detect the source language, and translate to the user's language. "
            "Return original text and translation side by side."
        ),
        output_format="translation_card",
    ),
    card=CardDef(template="translation_split", layout="side-by-side"),
)

EP_SHOP = ExperiencePackage(
    id="shop",
    label="Shop",
    hashtag="#shop",
    icon="🛒",
    skill=SkillDef(
        name="visual_shop",
        description="Find products matching what's visible",
        system_prompt_patch=(
            "You are in Shop mode. Identify the product/item in the image. "
            "Search for matching products with prices and store links. "
            "Return as a shopping results card with comparison."
        ),
        output_format="shopping_card",
    ),
    card=CardDef(template="shopping_results", layout="grid"),
)

EP_SOLVE = ExperiencePackage(
    id="solve",
    label="Solve",
    hashtag="#solve",
    icon="🧮",
    skill=SkillDef(
        name="math_solve",
        description="Solve math problems and equations",
        system_prompt_patch=(
            "You are in Solve mode. Extract the math problem/equation from "
            "the image. Provide a step-by-step solution with clear formula "
            "rendering. Highlight the final answer."
        ),
        output_format="solution_card",
    ),
    card=CardDef(template="solution_steps", layout="full"),
)

EP_ASK = ExperiencePackage(
    id="ask",
    label="Ask",
    hashtag="#ask",
    icon="💬",
    skill=SkillDef(
        name="general_analysis",
        description="General analysis — agent decides what's relevant",
        system_prompt_patch=(
            "You are in general analysis mode. Analyze the image and context "
            "freely. Decide what's most relevant and respond naturally."
        ),
        output_format="general_card",
    ),
    card=CardDef(template="general_card", layout="full"),
)

# ─── Contextual Experience Packages (AI-injected when detected) ──────

EP_NUTRITION = ExperiencePackage(
    id="nutrition",
    label="Nutrition",
    hashtag="#nutrition",
    icon="🍎",
    contextual=True,
    skill=SkillDef(
        name="food_analysis",
        description="Analyze food and nutrition information",
        system_prompt_patch=(
            "You are in Nutrition mode. Identify the food items visible, "
            "estimate portions, and provide nutritional breakdown "
            "(calories, macros, key nutrients)."
        ),
        output_format="nutrition_card",
    ),
    card=CardDef(template="nutrition_card", layout="full"),
)

EP_READ = ExperiencePackage(
    id="read",
    label="Read",
    hashtag="#read",
    icon="📖",
    contextual=True,
    skill=SkillDef(
        name="ocr_extract",
        description="Extract and format text from documents",
        system_prompt_patch=(
            "You are in Read mode. Extract all text from the image using OCR. "
            "Preserve formatting, paragraphs, and structure. Return clean text."
        ),
        output_format="text_card",
    ),
    card=CardDef(template="text_card", layout="full"),
)

EP_TODO = ExperiencePackage(
    id="todo",
    label="Todo",
    hashtag="#todo",
    icon="✅",
    contextual=True,
    skill=SkillDef(
        name="task_extract",
        description="Extract tasks from whiteboards and lists",
        system_prompt_patch=(
            "You are in Todo mode. Extract all task items, to-do lists, or "
            "action items from the image. Return as a structured checklist."
        ),
        output_format="checklist_card",
    ),
    card=CardDef(template="checklist_card", layout="full"),
)

EP_SCHEDULE = ExperiencePackage(
    id="schedule",
    label="Schedule",
    hashtag="#schedule",
    icon="📅",
    contextual=True,
    skill=SkillDef(
        name="event_extract",
        description="Extract event details from flyers and invitations",
        system_prompt_patch=(
            "You are in Schedule mode. Extract event details: title, date, "
            "time, location, description. Return as an event card."
        ),
        output_format="event_card",
    ),
    card=CardDef(template="event_card", layout="full"),
)


# ─── Registry ─────────────────────────────────────────────────────────

# Default packages (shown in intent bar)
DEFAULT_PACKAGES: list[ExperiencePackage] = [
    EP_SEARCH, EP_IDENTIFY, EP_TRANSLATE, EP_SHOP, EP_SOLVE, EP_ASK,
]

# Contextual packages (AI-injected when content detected)
CONTEXTUAL_PACKAGES: list[ExperiencePackage] = [
    EP_NUTRITION, EP_READ, EP_TODO, EP_SCHEDULE,
]

# All packages indexed by hashtag
PACKAGE_REGISTRY: dict[str, ExperiencePackage] = {
    ep.hashtag: ep for ep in DEFAULT_PACKAGES + CONTEXTUAL_PACKAGES
}


def get_package(hashtag: str) -> ExperiencePackage | None:
    """Look up an Experience Package by its #hashtag command."""
    if not hashtag.startswith("#"):
        hashtag = f"#{hashtag}"
    return PACKAGE_REGISTRY.get(hashtag)


def get_ep_registry_prompt() -> str:
    """Generate the Experience Package registry table for the agent system prompt."""
    lines = [
        "## Experience Packages",
        "",
        "You have access to the following Experience Packages.",
        "When analyzing the camera feed, suggest the most relevant one via `suggest_action`.",
        "",
        "| Command | Use When |",
        "|---------|----------|",
    ]
    for ep in DEFAULT_PACKAGES + CONTEXTUAL_PACKAGES:
        lines.append(f"| `{ep.hashtag}` | {ep.skill.description} |")
    lines.extend([
        "",
        "When you detect relevant content, suggest the matching intent.",
        "Only suggest if confidence >= 0.8. Don't suggest more than once every 3 seconds.",
    ])
    return "\n".join(lines)
