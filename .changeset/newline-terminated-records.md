---
"deployoor": patch
---

End each written `deployments/**.json` and `deployments/sources/*.json` with a newline. The files
were already indented; without the final newline git printed `\ No newline at end of file` on every
record, and the first `prettier --write` over the project rewrote all of them.
