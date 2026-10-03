---
name: frugal
description: Cost-optimized model routing for Claude Code. Use when the user types /frugal or asks to work cheaply, save usage, or route work to cheaper models. Splits the task into steps and hands each step to the cheapest Claude model that can do it well (Haiku → Sonnet → Opus), escalating only when a cheaper model's result falls short.
---

# Frugal: cost-optimized model routing

The goal is to finish the user's task well while spending as little model usage as possible.
The main conversation's model can't be changed from here, so save cost by **delegating** steps
to helper agents with the `Agent` tool's `model` parameter. Invoking this skill counts as the
user asking for helper agents.

## 1. Plan and label each step

Break the task into steps. Give each step a tier:

| Tier | Model (`model:`) | Use for |
|---|---|---|
| Cheap | `haiku` | Finding files, grepping, reading and summarising code, listing usages, running tests or builds and reporting the results, mechanical edits with an exact spec (rename, add a field, update a string), writing boilerplate or docs from a clear template |
| Mid | `sonnet` | Normal feature work in one or two files, bug fixes with a known cause, writing tests, code review of a small diff, refactors with clear boundaries |
| Top | `opus`, or do it yourself | Unclear root causes, cross-cutting design, security- or money-sensitive logic (payments, auth, bank-charge automation), anything a cheaper tier already failed |

If a step is so small it takes you one or two tool calls, just do it yourself.
Starting a helper costs more than that.

## 2. Delegate with tight briefs

Helper agents start with no context. Every brief must include:
- the exact goal and what "done" looks like
- the file paths and names you already know, so they don't search again
- constraints (don't touch X, match the existing style, don't commit)
- what to report back: short, with file:line references and no file dumps

Use `subagent_type: "Explore"` with `model: "haiku"` for read-only searching.
Use `general-purpose` with the chosen `model` for steps that edit code.
Run independent steps in parallel in one message.

## 3. Check, then escalate only if needed

Check each helper's result: read the diff and run the relevant test or lint.
- Good → move on.
- Wrong or incomplete → rerun that step one tier higher with a sharper brief
  that says what went wrong. Never retry at the same tier more than once.
- Failed at `sonnet` → do it yourself.

## 4. Report the routing

Finish with the normal answer, plus one short line showing where the work went, e.g.
`Routing: 3 steps on Haiku, 1 on Sonnet, 1 escalated to Opus (test fix).`

## Guardrails

- Quality comes first. Never ship a cheaper result you haven't checked.
- Don't delegate decisions that belong to the user. Ask them directly.
- Keep your own replies short. Your output tokens cost the most.
