# Output Patterns

Use these patterns when skills need to produce consistent, high-quality output.

TemplatePattern {
  Constraints {
    Provide templates for output format.
    Match strictness level to the skill's needs.
  }

  apply(requirements) => match (requirements) {
    case (strict: API responses, data formats) => {
      Use exact template structure.
      Mark template with "ALWAYS use this exact template structure."
      Example {
        ```markdown
        ## Report structure

        ALWAYS use this exact template structure:

        # [Analysis Title]

        ## Executive summary
        [One-paragraph overview of key findings]

        ## Key findings
        - Finding 1 with supporting data
        - Finding 2 with supporting data

        ## Recommendations
        1. Specific actionable recommendation
        ```
      }
    }
    case (flexible: adaptive, context-dependent) => {
      Provide sensible defaults with room for judgment.
      Mark template with "use your best judgment."
      Example {
        ```markdown
        ## Report structure

        Here is a sensible default format, but use your best judgment:

        # [Analysis Title]

        ## Executive summary
        [Overview]

        ## Key findings
        [Adapt sections based on what you discover]

        Adjust sections as needed for the specific analysis type.
        ```
      }
    }
  }
}

ExamplesPattern {
  Constraints {
    Use input/output pairs when output quality depends on seeing examples.
    Examples communicate desired style and detail level better than descriptions alone.
  }

  Example {
    ```markdown
    ## Commit message format

    Generate commit messages following these examples:

    **Example 1:**
    Input: Added user authentication with JWT tokens
    Output:
    feat(auth): implement JWT-based authentication
    Add login endpoint and token validation middleware

    **Example 2:**
    Input: Fixed bug where dates displayed incorrectly in reports
    Output:
    fix(reports): correct date formatting in timezone conversion
    Use UTC timestamps consistently across report generation

    Follow this style: type(scope): brief description, then detailed explanation.
    ```
  }
}
