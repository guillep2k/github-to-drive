# Github to Google Drive Synchronizer

## Purpose

Use this action to keep a Google Drive folder in sync with the contents of a Github repository.

* This requires a Google service account with **Editor** permissions in the Drive's folder.
* The Drive account must have **Drive** API access enabled.
* All files and directories created on Drive will be owned by the provided service account.
* The program will sync a snapshot of the files according to the latest contents of the referenced branch, not the contents at the moment of the triggered action. This is meant to prevent that re-running an older action task would overwrite or unsync Drive's contents.
* Any files showing in the log for the provided branch since the first commit will be deleted/overwritten in the Drive folder to match the last commit of the repository; even those created and deleted prior of the implementation of the action.
* All files and folders that are present in Drive but were never part of the original repository (matched by path) will be left untouched (i.e. not deleted).
* Files in Drive created from this action will have a description 'Created/Modified/Removed by ${Github2Drive} upon commit xxxxxx'.
* Deleted files will go to Google Drive's `Trash`, but by Google's design, files in `Trash` can only be seen by the service account.
* A Slack channel will be notified if a webhook URL is provided.

## Environment

### Mandatory

* **GOOGLE_KEY**: The JSON object of a Google API key for a service account with *Editor* permissions on the provided folder.
* **GDRIVE_FOLDERID**: The folder ID on Google Drive that would be the root of the uploaded content.
* **GIT_ORIGIN**: `origin/main` or other branch in the `origin` remote to use as source.

### Optional

* **GIT_SUBDIR**: In the local repository, the path to the subfolder that holds the contents to upload (can be ".")
* **SLACK_CHANNELS**: List of Slack channels (separated by `|`) to post updates to; these must be URLs from Slack webhooks.
* **GIT_ROOT**: _[Intended for testing only]_ Local path to the git root folder (normally "." or left unset) (e.g. /home/users/repo)

## Example usage

On your repository, set up `GOOGLE_KEY` and optionally `SLACK_CHANNELS` as action secrets. Set up `GDRIVE_FOLDERID`, `GIT_ORIGIN`, and optionally `GIT_SUBDIR`. Secrets and variables can be set in Github at `Settings` ➔ `Secrets and variables` ➔ `Actions` ➔ `Secrets/Variables` `New repository secret/variable`.

On your repository, add the following content to `.github/workflows/action.yml`:

```yaml
name: CI
on: [push]
  branches:                 # Can use 'branches' or 'tags'
    - 'main'                # This action only supports one reference
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v3
      with:
        # ref: main     # Normally not required
        fetch-depth: 0
        lfs: true
    - name: Update Guides
      uses: guillep2k/gitub-to-drive@latest
      env:
        GOOGLE_KEY: ${{ secrets.GOOGLE_KEY }}           # Always use secrets
        GDRIVE_FOLDERID: ${{ vars.GDRIVE_FOLDERID }}    # Use secrets or vars accordingly
        GIT_ORIGIN: ${{ vars.GIT_ORIGIN }}              # Use secrets or vars accordingly
        GIT_SUBDIR: ${{ vars.GIT_SUBDIR }}              # Use secrets or vars accordingly
        SLACK_CHANNELS: ${{ secrets.SLACK_CHANNELS }}   # Always use secrets
```

## Notes for developers

To publish a new version, the following commands are required:

```
npm run all                 # Compile and package the project for distribution
git add .                   # Add the modified files to git
git commit -m '...'         # Commit the changes on the generated files (edit the commit message)
git tag -f latest           # Move the 'latest' tag to the repository
git push                    # Push current (e.g. 'main') branch to Github
git push -f origin latest   # Push the 'latest' tag to Github
```