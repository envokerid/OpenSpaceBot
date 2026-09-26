# OpenMausBot agent notes

For UI changes, run relevant automated tests and leave visual verification to
the user. Do not launch UI fixtures, emulators, browsers, or screenshot checks
unless the user asks.

Before claiming a server or conversation behavior change works, follow
[`docs/verification/README.md`](docs/verification/README.md). Always launch an
isolated fixture; never verify mutations against the user's live app or data.

More specific `AGENTS.md` files override this note within their directories.
