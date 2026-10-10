## In short

When you pressed Ctrl-C while Click wrote "Aborted!" or showed an error message, the interrupt itself escaped as an unhandled traceback. This PR catches that interrupt and ensures the command still exits with its intended code; only the message may be lost. Safe to merge.

## What was wrong

Say you pressed Ctrl-C at a prompt that timed out, and a second Ctrl-C arrived while Click was printing "Aborted!" to stderr. The `echo()` call and the `sys.exit(1)` both ran inside `except` clauses that had no `try` above them to catch a second interrupt. So the KeyboardInterrupt escaped `Command.main()` as an unhandled traceback, which broke the promise that standalone mode handles every interrupt internally.

## How it works now

The fix is to defer, then guard: collect what to do (the message function and the exit code) in the inner `try`, and do it in a teardown after, with an outermost `try` above that to catch late interrupts. Every handler that used to write a message and exit immediately now saves a reference to the message function in `report` and the code in `exit_code` instead. The teardown at the end of the outer `try` calls `report()` if it exists and then `sys.exit(exit_code)`. An outermost `except (EOFError, KeyboardInterrupt)` below that catches any interrupt arriving during the teardown and still exits with `exit_code`. So if Ctrl-C lands while Click calls `_echo_aborted()`, the message is lost but the exit code is still 1.

```text
Before:
  try
    try invoke()
    except KeyboardInterrupt
      echo(blank)     ← second Ctrl-C escapes from here
      raise Abort
  except Abort
    echo("Aborted!")  ← or from here
    exit(1)

After:
  try
    try invoke()
    except KeyboardInterrupt
      echo(blank)
      report = _echo_aborted
      exit_code = 1
    if report: report()  ← second Ctrl-C caught below
    exit(exit_code)
  except KeyboardInterrupt
    exit(exit_code)
```

The same pattern applies to `Exit`, `Abort`, `ClickException`, and the `EPIPE` `OSError`: each checks standalone mode and either propagates or sets `report` and `exit_code`, then the teardown does both at once under the guard.

## Where to look

1. `src/click/core.py:1551-1623` - The restructured `Command.main()`. Pay attention to the new `report`/`exit_code` collection at the top, how each handler sets them instead of exiting directly, and the outermost `except (EOFError, KeyboardInterrupt)` at the bottom that catches late interrupts.
2. `tests/test_abort_interrupt.py` - Four test scenarios. The `RecordingStderr` with `interrupt_at` simulates interrupts at precise moments (`echo()` calls `isatty()` before writing, which is where the interrupt lands).

You can skip `docs/exceptions.md` and `CHANGES.md`, which document the fix.

## What I'd double-check

- Does the `report` pattern fit with how Click's other deferred operations work? The `_PacifyFlushWrapper` for `EPIPE` is the only precedent I see for deferred cleanup, and it happens inline rather than through a stored callable. Worth checking if this pattern might confuse future changes to the error handling.

## Problems

None found.

## The numbers

- **Size:** 4 files, +273/−37. Logic: +52/−24 in 1 file. Tests: +179/−0 in 1 file. Config: none. Docs: +42/−13 in 2 files. Noise (skipped): none.
- **Who calls the changed code:** `Command.main` is called from 2 places; both are in the tree-sitter output. `Command.__call__` is in this PR's file and calls the modified `main`. `CliRunner.invoke` in `src/click/testing.py` is not changed in this PR.
- **Tests:** `Command.main` has 4 new tests in this PR. The new `_echo_aborted` helper is not called from tests directly, only through `Command.main`.
- **Not reviewed:** None.