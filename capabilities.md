# Tool capabilities

One sentence per tool the assistant can call — what it does, not how. The
authoritative, model-facing wording lives in
[`packages/prompts/prompts/tools.yaml`](packages/prompts/prompts/tools.yaml);
this table is a human-facing summary of the same set, registered in
[`packages/tools/src/registry.ts`](packages/tools/src/registry.ts). Whether a
given channel/profile can actually call a tool is a separate, per-profile
`enabledToolNames` allowlist, not tracked here.

| Tool | Does |
| --- | --- |
| `get_schedule` | Reads back the owner's schedule for a date range, grouped by day. |
| `add_event` | Adds an event at a given date expression, with an optional duration. |
| `update_event` | Completes, cancels, moves/resizes, or splits an existing event, found by id or a title search. |
| `add_task` | Adds a task — work to be done with no fixed time — optionally with a deadline, an estimate, a project, and dependencies on other open tasks. |
| `update_task` | Completes, cancels, or edits an existing task (title, description, estimate, deadline, dependencies), found by id or a title search. |
| `add_project` | Starts a project; if given a description, generates its tasks in the background rather than immediately. |
| `generate_schedule` | Submits a background job that proposes placements for open, unscheduled tasks over a horizon, without committing anything yet. |
| `confirm_schedule` | Turns a previously generated schedule proposal's events from proposed into real, planned ones. |
| `list_tasks` | Reads back the owner's tasks, defaulting to open ones only. |

## Keeping this current

Add a row here in the same change that adds a tool to `ALL_TOOLS`
(`packages/tools/src/registry.ts`) — there's no automated check tying the two
together, so this file only stays accurate if it's part of the review, not a
follow-up.
