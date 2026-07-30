# GitHub Actions NuGet validation fix

## Symptom

The Windows runner restored the NuGet cache below `.nuget/packages`. The static
validator recursively matched the package directory `newtonsoft.json` with the
`*.json` glob and attempted to read the directory as a JSON file. Windows then
returned `Permission denied` and the job stopped before MSBuild.

## Fix

- `tools/validate_project.py` now scans regular project files only.
- Generated and cache trees are excluded: `.git`, `.nuget`, `.vs`, `.idea`,
  `artifacts`, `bin`, `obj`, `node_modules`, and `packages`.
- `.github/workflows/xbox-debug-app.yml` now stores the NuGet cache under
  `${{ runner.temp }}\VacuumTubeNuGetPackages`, outside the checked-out source tree.

## Regression test

The validator was executed with a deliberately created directory named
`.nuget/packages/newtonsoft.json`. It skipped that directory and completed all
71 project checks successfully.
