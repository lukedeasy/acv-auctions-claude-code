# Ticket: make report generation visible and recoverable

**Product request.** Inspection coordinators generate a report from an inspection screen. Today the
screen waits for the whole report to be built before it shows anything. When generation fails, the
coordinator sees an error but cannot try again without reloading the page.

We want coordinators to:

- see that a report is being generated and know when it is ready,
- understand a failure and retry it safely,
- open the correct report for the inspection they are looking at.

Report contents must not change. A report for the same inspection must read exactly the same as today.

**Where to start.** The report panel on `/inspections/:inspectionId`, its request code, and the report
routes on the server. A prepared job service already exists on the server; the panel does not use it yet.

**What this ticket does not say.** It does not define what "progress" looks like, what counts as a
safe retry, or what happens when the same report is requested twice. Those decisions belong to the
product owner. The answers are in [product-decisions.md](product-decisions.md); your specification
(M2) turns them into testable requirements. The full acceptance rules are in [acceptance.md](acceptance.md).
