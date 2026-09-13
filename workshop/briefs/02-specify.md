# M2 — Specify the result precisely (20 minutes)

**Claude Code capability:** Claude-led clarification with `AskUserQuestion`, grounded in files and the
shared product decisions; preserving the agreed result as task context in `SPEC.md`.

**Opening:** Use Claude to clarify the modernization request, then write an engineering specification
another engineer can implement and test.

## Do

1. Read `workshop/ticket.md` and `workshop/product-decisions.md`.
2. Ask Claude to find the consequential ambiguities **before** it drafts anything. Starting prompt:

   > Read the ticket, the observed defect and the product-decision sheet. Ask me about consequential
   > unresolved requirements before drafting SPEC.md. Separate answers supported by those sources from
   > unknowns. Make each acceptance case observable. Include what must remain unchanged and what this
   > task excludes.

3. Answer only from the product-decision sheet. If a question is not answered there, it becomes an
   open decision in the spec; do not invent a rule.
4. Complete `SPEC.md`. Aim for about one page plus the acceptance table. Each AC row needs a concrete
   example, an expected result and the check that will prove it.
5. Correct the draft where it misses failure cases, preserved behavior or exclusions.

## Submit

`SPEC.md` and the **M2** entry in `EVIDENCE.md` showing one material clarification or correction and
its effect on the requirements. `npm run check -- --stage m2` verifies structure and unique IDs only.

## How M2 is graded (10 method points)

| Level | Looks like |
| --- | --- |
| 0 | "Make retry robust" plus a generated document with no checked clarification. |
| 5 | A supported clarification captured in the session, but failure/preservation rules materially incomplete. |
| 10 | Product answers translated into precise failure/retry rules, preserved behavior, exclusions and observable acceptance cases. |

Wording does not need to match the trainer's answer. A complete copied answer without evidence of a
checked decision cannot earn full credit.

## If you fall behind

The facilitator will publish any missing product answer to everyone. Correct your spec afterwards;
nothing is revealed only in grading.
