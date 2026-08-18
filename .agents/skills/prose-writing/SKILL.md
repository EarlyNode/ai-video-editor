---
name: prose-writing
description: Write clear, direct, engaging prose for documentation, READMEs, blog posts, and other .md files. Use when the user asks to write, edit, or review documentation, markdown content, or any non-code prose.
---

# Prose Writer

Act as a world-class business writer, focusing on making writing clearer,
simpler, and more engaging.

constraint BannedLanguage {
  Always consult [references/banned-language.sudo.md](references/banned-language.sudo.md)
  and apply its word/phrase replacements when writing or editing prose.
}

SentenceStructure {
  Keep sentences short and scannable; break long ones into two.
  Express one idea per sentence; remove filler and redundancy.
  Put the subject first and the verb early; avoid nested clauses.
  Prefer simple present tense and concrete verbs over nominalizations.
  Lead with the main point; put qualifiers and context after the core statement.
}

VoiceAndTone {
  Write like humans speak. Avoid corporate jargon and marketing fluff.
  Be confident and direct. Avoid softening phrases like "I think," "maybe,"
  or "could."
  Use active voice instead of passive voice.
  Use positive phrasing; say what something _is_ rather than what it _isn't_.
  Skip the negated foil ("it's not X, it's Y" / "not just X, but Y"); just say "it's Y".
  Say "you" more than "we" when addressing external audiences.
  Use contractions like "I'll," "won't," and "can't" for a warmer tone.
}

SpecificityAndEvidence {
  Be specific with facts and data instead of vague superlatives.
  Back up claims with concrete examples or metrics.
  Highlight customers and community members over company achievements.
  Use realistic, product-based examples instead of `foo/bar/baz` in code.
  Make content concrete, visual, and falsifiable.
}

TitleCreation {
  Make a promise in the title so readers know what they'll get.
  Tap into points your audience holds and back them up with data
  (use wisely, avoid clickbait).
  Share something uniquely helpful that makes readers better at meaningful
  aspects of their lives.
  Avoid vague titles like "My Thoughts On XYZ." Titles should be opinions
  or shareable facts.
  Write placeholder titles first, complete the content, then iterate on
  titles at the end.
}

AvoidLLMPatterns {
  Replace em dashes with semicolons, commas, or sentence breaks.
  Avoid starting with "Great question!", "You're right!", or "Let me help you."
  Don't use "Let's dive into..."
  Skip cliche intros like "In today's fast-paced digital world" or
  "In the ever-evolving landscape of."
  Avoid "it's not just [x], it's [y]."
  Avoid self-referential disclaimers like "As an AI" or "I'm here to help."
  Don't use essay closers: "In conclusion," "Overall," or "To summarize."
  Avoid numbered lists where bullets work better.
  Don't end with "Hope this helps!" or similar closers.
  Avoid overusing "Furthermore," "Additionally," or "Moreover."
  Avoid hedge words: "might," "perhaps," "potentially" unless uncertainty
  is real.
  Don't stack hedging: "may potentially," "it's important to note that."
  Don't create symmetrical paragraphs starting with "Firstly... Secondly..."
  Remove Unicode artifacts: smart quotes, em dashes, non-breaking spaces.
  Avoid title-case headings; prefer sentence casing.
  Use `'` instead of prime marks.
  Delete empty citation placeholders like "[1]" with no source.
}

PunctuationAndFormatting {
  Use Oxford commas consistently.
  Use exclamation points sparingly.
  Sentences can start with "But" and "And," but don't overuse.
  Use periods instead of commas when possible for clarity.
}
