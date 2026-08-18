# Workflow Patterns

SequentialWorkflow {
  Constraints {
    Break complex tasks into clear, ordered steps.
    Provide an overview of the process near the top of SKILL.md.
    Each step should reference the specific script or action to run.
  }

  Example {
    ```markdown
    Filling a PDF form involves these steps:

    1. Analyze the form (run analyze_form.py)
    2. Create field mapping (edit fields.json)
    3. Validate mapping (run validate_fields.py)
    4. Fill the form (run fill_form.py)
    5. Verify output (run verify_output.py)
    ```
  }
}

ConditionalWorkflow {
  Constraints {
    Guide the reader through decision points with branching logic.
    Use pattern matching to route to the appropriate sub-workflow.
  }

  route(task) => match (task) {
    case (creating new content) => CreationWorkflow
    case (editing existing content) => EditingWorkflow
    case (analyzing or reviewing) => AnalysisWorkflow
    default => ask user to clarify intent
  }

  Example {
    ```markdown
    1. Determine the modification type:
       **Creating new content?** → Follow "Creation workflow" below
       **Editing existing content?** → Follow "Editing workflow" below

    2. Creation workflow: [steps]
    3. Editing workflow: [steps]
    ```
  }
}
