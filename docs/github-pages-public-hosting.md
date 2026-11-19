# Public GitHub Pages hosting — Jobs

The actual Jobs web application is built from the private `release/jobs-android` branch and published **as compiled files only** to a separate public repository. This does **not** publish the private Jobs source or customer example files.

## One-time setup

1. In GitHub, create a **public, empty** repository named `Jobs-Web` under `william2535`. Do not initialise it with a README, licence or .gitignore.
2. In GitHub Settings → Developer settings → Personal access tokens → Fine-grained tokens, create a token scoped only to `william2535/Jobs-Web` with **Contents: Read and write**. Set an expiry and keep it private.
3. In the **private** `william2535/Jobs` repository, open Settings → Secrets and variables → Actions → New repository secret. Name it `JOBS_WEB_PUBLISH_TOKEN` and paste the token.
4. In the private Jobs repository, go to Actions → **Publish Jobs browser build to public GitHub Pages repository** → Run workflow. Choose branch `release/jobs-android`. Wait for the workflow to pass.
5. In `Jobs-Web` Settings → Pages, select **Deploy from a branch**, branch `main`, folder `/(root)`. Save.
6. Visit `https://william2535.github.io/Jobs-Web/`. Initial Pages activation may take a few minutes. Verify the blue banner, logo-to-home interaction, open-jobs badge, local saves and offline readiness.

The workflow runs on relevant updates to `release/jobs-android` as well as manual dispatch. It runs tests and release validation, bundles the approved blue banner, and force-replaces only the generated `Jobs-Web` branch content. Do not put hand-edited files in the public output repository; they will be overwritten.

## Security and data

Only `dist/` is published. Do not publish the original private repository, its example customer data, keystore, signing secrets or full git history. Jobs stores work locally in each browser's IndexedDB; browser storage is not synced between the old hosted domain and the new GitHub Pages domain. **Export a workspace backup from the existing Jobs site and restore it on the new site** before relying on the new URL. Never assume existing jobs automatically appear at the new address.

Keep the original hosted site running until the new site is verified. Once it works, update the Jobs Free Test button in the App Hub to `https://william2535.github.io/Jobs-Web/`.

If the workflow fails, inspect the failing step in GitHub Actions. The most likely missing prerequisite is the token secret or the empty public repository. No publication occurs until these are configured.
