// @flow weak
import fs from "fs";
import path from "path";
import globby from "globby";

// TODO: make resync a thing and make get-workspaces use it so we can have this sync version without duplicating the logic
export default function sync({
  cwd = process.cwd(),
  tools = ["yarn", "bolt"]
}) {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(cwd, "package.json"), "utf-8")
  );

  let workspaces;

  if (tools.includes("yarn") && pkg.workspaces) {
    if (Array.isArray(pkg.workspaces)) {
      workspaces = pkg.workspaces;
    } else if (pkg.workspaces.packages) {
      workspaces = pkg.workspaces.packages;
    }
  } else if (tools.includes("bolt") && pkg.bolt && pkg.bolt.workspaces) {
    workspaces = pkg.bolt.workspaces;
  }

  if (!workspaces) {
    if (tools.includes("root")) {
      return [{ config: pkg, dir: cwd, name: pkg.name }];
    }
    return [];
  }

  const folders = globby.sync(workspaces, {
    cwd,
    onlyDirectories: true,
    absolute: true,
    expandDirectories: false
  });

  let pkgJsonsMissingNameField = [];

  const results = folders
    .sort()
    .filter(dir => fs.existsSync(path.join(dir, "package.json")))
    .map(dir => {
      let contents = fs.readFileSync(path.join(dir, "package.json"), "utf8");
      const config = JSON.parse(contents);
      if (!config.name) {
        pkgJsonsMissingNameField.push(
          path.relative(cwd, path.join(dir, "package.json"))
        );
      }
      return { config, name: config.name, dir };
    });
  if (pkgJsonsMissingNameField.length !== 0) {
    pkgJsonsMissingNameField.sort();
    throw new Error(
      `The following package.jsons are missing the "name" field:\n${pkgJsonsMissingNameField.join(
        "\n"
      )}`
    );
  }
  return results;
}
