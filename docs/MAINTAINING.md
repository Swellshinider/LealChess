# Maintaining LealChess

## Triage

Keep support in the question issue form and security disclosures in private vulnerability
reporting. Confirm reproduction, affected version, privacy impact, persisted-data impact, and the
smallest acceptable outcome before scheduling work. Apply focused labels and close duplicates with
a link to the canonical issue.

Require an issue for material changes. Security fixes may remain private until coordinated
disclosure. Do not request private chess data in public.

## Pull requests

Keep `main` releasable. Require one approving review, resolved conversations, and strict `quality`
and `browser` checks. Review architecture direction, keyboard and screen-reader behavior,
local-first privacy, and IndexedDB compatibility in addition to the code.

Use merge commits only, with the pull request title as the merge subject. Keep subjects concise
and free of conventional-commit prefixes. Delete merged branches.

## Releases

LealChess uses Semantic Versioning:

- Patch releases contain compatible fixes.
- Minor releases contain compatible capabilities.
- Major releases contain intentionally incompatible behavior or persisted-data changes.

To release:

1. Choose `MAJOR.MINOR.PATCH` and update `package.json`.
2. Run `pnpm verify`.
3. Merge the release preparation through the protected `main` branch.
4. Create and push the immutable `vMAJOR.MINOR.PATCH` tag.
5. Confirm the Release workflow validates the version, reruns quality checks, and creates the
   GitHub Release with generated release notes.

Never move or delete a published release tag.

## Publication settings

The repository can remain private while preparing these files. GitHub Free protections that return
403 for a private repository should be configured immediately after publication.

### General

- Keep `main` as the default branch.
- Allow merge commits only and use pull request titles for merge commits.
- Enable branch updates, auto-merge, and automatic deletion of merged branches.
- Disable Discussions, Projects, and Wiki.
- Verify the description, topics, GPL license detection, and community profile.

### Main branch ruleset

Target `main` and disallow bypass, including administrator bypass:

- Require a pull request.
- Require one approval, dismiss stale approvals, and require approval of the latest push.
- Do not require CODEOWNERS.
- Require all conversations to be resolved.
- Require strict `quality` and `browser` status checks.
- Allow merge commits only.
- Block force pushes and deletion.

Only enable the approval rule after confirming a second collaborator can approve changes;
otherwise `main` will intentionally be unmergeable.

### Tag ruleset

Target all tags. Permit creation only through a repository-administrator bypass and block updates,
deletions, and force changes. Maintainers create only immutable `vMAJOR.MINOR.PATCH` release tags.

### Security and Actions

- Enable dependency graph, Dependabot alerts, Dependabot security updates, CodeQL default setup,
  secret scanning, push protection, and private vulnerability reporting.
- Restrict Actions to GitHub-owned, verified, and explicitly allowed immutable actions.
- Keep default workflow permissions read-only.
- Restore available GitHub Actions minutes for the private repository, or publish the repository
  so public-repository standard runners no longer consume the private-repository quota. Require
  both remote CI jobs to pass before declaring publication readiness.

Before publication, run `pnpm verify`, confirm `git ls-files -ci --exclude-standard` is empty, and
scan the full Git history with Gitleaks. Review findings without committing generated scan output.

GitHub references:

- [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [Configure private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
