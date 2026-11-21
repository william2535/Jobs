# Legacy optional Jobs-Web export

The current website is **https://william2535.github.io/Jobs/**. Its automatic deployment is documented in [deployment.md](deployment.md). No separate repository or publishing token is required for that existing workflow.

This guide retains the older, optional export to a separate `Jobs-Web` repository. Its workflow is **manual-only** and is not the current website's deployment route. If explicitly configured, it builds `release/jobs-android` and publishes **compiled files only**, excluding private source and customer examples.

## One-time setup

1. In GitHub, create a **public, empty** repository named `Jobs-Web` under `william2535`. Do not initialise it with a README, licence or .gitignore.
2. In GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, create a token scoped only to `william2535/Jobs-Web` with **Contents: Read and write**. Set an expiry and keep it private.
3. In the **private** `william2535/Jobs` repository, open Settings → Secrets and variables → Actions → New repository secret. Name it `JOBS_WEB_PUBLISH_TOKEN` and paste the token.
4. In the private Jobs repository, go to Actions → **Publish Jobs browser build to public GitHub Pages repository** → Run workflow. Choose branch `release/jobs-android`. Wait for the workflow to pass.
5. In `Jobs-Web` Settings → Pages, select **Deploy from a branch**, branch `main`, folder `/(root)`. Save.
6. Visit `https://william2535.github.io/Jobs-Web/`. Initial Pages activation may take a few minutes. Verify the blue banner, logo-to-home interaction, open-jobs badge, local saves and offline readiness.

This optional workflow runs only by manual dispatch. It runs tests and release validation, bundles the approved blue banners, and force-replaces only the generated `Jobs-Web` branch content. Do not put hand-edited files in the output repository; they will be overwritten.

## Security and data

Only `dist/` is published. Do not publish the original private repository, its example customer data, keystore, signing secrets or full git history. Jobs stores work locally in each browser's IndexedDB; browser storage is not synced between the old hosted domain and the new GitHub Pages domain. **Export a workspace backup from the existing Jobs site and restore it on the new site** before relying on the new URL. Never assume existing jobs automatically appear at the new address.

Existing app links should continue to use **https://william2535.github.io/Jobs/**. Do not change links to this optional export destination unless deliberately migrating and verifying that separate deployment.

If the workflow fails, inspect the failing step in GitHub Actions. The most likely missing prerequisite is the token secret or the empty public repository. No publication occurs until these are configured.
