# Notes for Claude

- When a change is done (tested, committed, pushed), **always open a pull request** into `main` without asking.
  If the previous PR from the working branch was already merged, rebase the new commits onto the latest `main` first.
- Before pushing: `npm run typecheck` and `npm run build:web` must pass.
- The app is used by older colleagues: keep text large, screens uncluttered, and confirm before anything destructive.
