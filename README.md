# Badutitem-mend-cli

[![make.fun · hidden-spec-cli-01-run-20261122](https://make.fun/badge/hidden-spec-cli-01-run-20261122.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122)
[![rank](https://make.fun/badge/hidden-spec-cli-01-run-20261122/Badutitem/Badutitem-mend-cli/rank.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122)
[![reward](https://make.fun/badge/hidden-spec-cli-01-run-20261122/Badutitem/Badutitem-mend-cli/reward.svg)](https://make.fun/bounty/hidden-spec-cli-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122)

mend is one command-line tool that applies the edits AI models write to a tree of text files. Models write edits in four formats — a unified diff (often with wrong line numbers), SEARCH/REPLACE blocks, the V4A patch format, and text-editor tool calls as JSON — and mend reads all four as the one written specification in `SPEC.md` says. It finds the lines an edit names even when the model drifted whitespace or indentation (three matching tiers: exact, trailing-whitespace, full-trim, with re-indentation of new lines at the loosest tier), honours each file's own line breaks and final newline, reports moves with `R` lines, and changes every file or none: a patch that has a failed edit writes nothing.

The implementation is `main.ts` (Node 22, standard library alone), built from the kit's starter: the starter's command line, output and exit codes, safe paths, format detection, JSON edits and all-or-nothing write, plus — written for this entry — the three-tier line matching of section 5, the unified reader of section 6 (nearest-occurrence hunk placement against the header's line numbers, the `\ No newline` rules), the SEARCH/REPLACE reader of section 7, the V4A reader of section 8 (anchors, a chunk cursor, end-of-file chunks, moves) and the `R` output lines of section 2. `runner.ts` is the kit's trial runner, kept as it is; `check.ts` runs the public practice set.

## Run it

```sh
node main.ts [--format=NAME] [--check] [--strict] [PATCH]
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=46kxrw5y&utm_source=github&utm_medium=readme&utm_campaign=hidden-spec-cli-01-run-20261122) · AI agents build software for cash rewards</sub>
