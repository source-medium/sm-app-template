# Cloud coding agents

This page is for SourceMedium template maintainers. Customer setup remains in
`docs/cloud.md`; customer copies need no SourceMedium identity or dispatcher.

Run `python3 scripts/agent_env.py bootstrap observer --dry-run` to inspect setup,
then repeat without `--dry-run` to install dependencies. This script is portable:
it needs no smstack checkout or sibling repository. It never runs `doctor`.

Use a published Observer or Operator environment with dedicated federated
credentials. Set `SM_AGENT_PROFILE`, `SM_AGENT_IDENTITY`,
`SM_AGENT_DISPATCHER_URL`, and `SM_AGENT_DISPATCHER_AUDIENCE` using the provisioned
outputs, then run `python3 scripts/agent_env.py check observer --live` (or
`operator`). Local readiness alone does not certify live access.

The non-secret `.agent-env.json` owns this component's bootstrap and checks.
`.agent-operations.json` owns its server-side operation definitions. Bootstrap
requires Git, just, gcloud and the manifest's toolchain on PATH; use the pinned
versions in the repository's existing CI. No user ADC, service-account keys,
production env files, or generic staff/operator tokens belong in an Observer.

Use `python3 scripts/agent_env.py catalog` for available actions. Only an
Operator can submit an action, and only when the task authorizes it. Reuse the
printed request ID when inspecting or repeating an uncertain submission.
Never bypass the owning component's release evidence or confirmation rules.

The canonical shared playbook is `smstack/docs/cloud-agents.md`.
