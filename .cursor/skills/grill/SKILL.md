---
name: grill
description: Use before any creative work in this repo - adding or changing a metric, chart, page, ingest rule, or automation. Pressure-tests the request with a few sharp questions instead of collaborative brainstorming. Use this instead of the brainstorming skill.
---

# Grill the request

Pressure-test the idea before building it. The point is to catch a vague or wrong
request while it is still cheap — one message of hard questions, not a design ceremony.

Grill the idea, never the person. The owner of this repo is not a payments engineer.
Sharp questions are welcome; jargon and condescension are not.

## How to grill

**Ask three to five questions in a single message.** Not one at a time. The user should
be able to answer the whole thing in one reply.

**Give a default with every question.** End each one with the answer you would pick and
why: "if you'd rather not decide, I'd do X because Y." A question with no default is a
roadblock for someone who doesn't know the domain.

**Scale to the change.** A copy tweak or a color change gets zero questions — just do
it. A new metric on the leadership page gets the full treatment. When in doubt, ask
fewer questions and start working.

**Say when you disagree.** If the request looks wrong, say so plainly and give the
reason before asking anything else. Agreeing and then quietly building the wrong thing
is the failure this skill exists to prevent.

## What to grill about

Adapt these to the request. They are the questions that usually matter here.

1. **What decision does this change?** This is an executive dashboard. If a number
   doesn't change what leadership does on Monday, it probably hasn't earned a spot on
   the page. `docs/ops/metric-priority.md` shows how the existing metrics were ranked.
2. **Where does the data come from, and can it be trusted?** Worldpay Auth Summary and
   Interchange are the only feeds. If the request needs chargebacks, retries, or
   per-shop splits, it cannot be built today — and that is the answer. Check the scope
   caveats in `docs/ops/data-certification.md` before promising a number.
3. **How will we know it's right?** Name the check: a test in `tests/`, a certification
   rule, or a figure someone can eyeball against the source Excel.
4. **What is the cheapest version that answers the question?** Offer it. A row on an
   existing scorecard often beats a new chart.
5. **What breaks it?** A missing column, a zero week, a holiday spike. The pipeline is
   fail-closed on purpose; a new metric that can silently publish a wrong number is a
   bug, not a feature.
6. **Is this the actual problem?** When the request names a solution ("add a pie
   chart"), ask what they were trying to see. There is frequently a better answer.

## After the questions

Write a short "here's what I'm building" — a few lines, plus what you are deliberately
not doing — and **wait for a yes before building.** The gate is fast, not skipped: a
couple of lines and a thumbs-up, not a spec document. The only time you need a written
design first is when the change touches the ingest contract or the certification rules;
those deserve a spec before code.

## Preview before prod — always

Nothing reaches leadership without being seen on preview first. This is the most
important gate in the repo, so treat it as non-negotiable. See
`docs/ops/preview-workflow.md`.

1. Build UI, chat, and design changes under `site/preview/` **only**. Do not touch
   `site/index.html` or the other leadership files at the root of `site/`.
2. Open a PR, review at the preview link, and get sign-off there.
3. Promote to the leadership homepage **only** when the user explicitly says "promote"
   (or "publish to leadership"), and do it as a separate PR that copies the approved
   preview files up.

If a request would edit a leadership file directly, stop and route it through preview
instead — unless the user has explicitly said to promote.

## When nobody is there to answer

Monday automations and cloud agents run unattended. Do not block on questions. Pick the
most defensible option, build it, and put the questions and the assumptions you made at
the top of the pull request description so they can be corrected after the fact.

## Escape hatches

- "just do it" or "no questions" — skip the grilling and build.
- `/brainstorm` — switch to collaborative design with a written spec.
