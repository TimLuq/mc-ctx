import type {
  IPluginService,
  IPluginSource,
  IPluginVersion,
} from "./service.ts";

import type {
  SemVer,
  SemVerRange,
} from "https://deno.land/std@0.208.0/semver/types.ts";
import { maxSatisfying } from "https://deno.land/std@0.208.0/semver/max_satisfying.ts";
import { parse as parseSemver } from "https://deno.land/std@0.208.0/semver/parse.ts";

type IModrinthVersion = IModrinthVersionItem[];

type LoaderOption = "bukkit" | "paper" | "purpur" | "spigot" | "fabric" | "forge" | "minecraft" | string;
type VersionType = "release" | "beta" | "alpha";
type VersionStatus = "listed" | "archived" | "draft" | "unlisted" | "scheduled";

interface IModrinthVersionItem {
  /** A list of game versions this version is compatible with, such as `"1.24.4"`. */
  game_versions: string[];
  /** A list of loaders this version is compatible with, such as `"paper"`. */
  loaders: LoaderOption[];
  /** The unique identifier for this version, this is a random string. */
  id: string;
  /** The unique identifier for the project this version belongs to, this is a random string. */
  project_id: string;
  /** The unique identifier for the uploader of this version, this is a random string. */
  author_id: string;
  /** If this version is featured. */
  featured: boolean;
  /** The name of this version, such as `"MyPlugin 1.0.0"`. */
  name: string;
  /** The semver version number. */
  version_number: string;
  /** A markdown text that renders to a list of changes or a link. */
  changelog?: string | null;
  /** A URL to a changelog. */
  changelog_url?: string | null,
  /** The date this version was published, ISO datetime. */
  date_published: string;
  /** The number of downloads this version has. */
  downloads: number;
  /** The type of version this is, one of `"release"`, `"beta"`, or `"alpha"`. */
  version_type: VersionType;
  /** The status of this version, one of `"listed"`, `"archived"`, `"draft"`, `"unlisted"`, or `"scheduled"`. */
  status: VersionStatus;
  /** The status this version is requested to be, one of `null`, `"listed"`, `"archived"`, `"draft"`, `"unlisted"`, or `"scheduled"`. */
  requested_status: null | VersionStatus;
  /** A list of files for this version. */
  files: IModrinthVersionFile[];
  /** A list of dependencies for this version. */
  dependencies: IModrinthVersionDep[],
}

interface IModrinthVersionFile {
  hashes: {
    sha1: string;
    sha512: string;
  };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
  file_type: null | string;
}

type ModrinthDepType = "required" | "optional" | "incompatible" | "embedded";

interface IModrinthVersionDep {
  /** The unique identifier for this dependency, this is a random string. */
  version_id?: string | null;
  project_id?: string | null;
  file_name?: string | null;
  dependency_type: ModrinthDepType;
}

export class Modrinth implements IPluginService {
  public readonly name: string = "Modrinth";

  public plugin_source(
    plugin: string,
    version_range?: SemVerRange,
  ): IPluginSource {
    return new ModrinthSource(this, plugin, version_range);
  }
}

class ModrinthSource implements IPluginSource {
  public readonly full_name: string;
  public readonly service: Modrinth;

  private readonly version_range?: SemVerRange;

  public get plugin_name(): string {
    return this.full_name.replace(/^.*\//, "");
  }

  public constructor(
    modrinth: Modrinth,
    full_name: string,
    version_range?: SemVerRange,
  ) {
    this.full_name = full_name;
    this.service = modrinth;
    this.version_range = version_range;
  }

  public async latest_version(): Promise<IPluginVersion> {
    const res = await fetch(
      `https://api.modrinth.com/v2/project/${this.plugin_name}/version`,
    );
    const result: IModrinthVersion = await res.json();
    if (result.length === 0) {
      throw new Error("No versions found");
    }
    let item = result[0];
    if (this.version_range) {
      const versions = result.map((v) => {
        try {
          return parseSemver(v.version_number);
        } catch {
          return null;
        }
      });
      const max = maxSatisfying(
        versions.filter((x) => !!x) as SemVer[],
        this.version_range,
      );
      if (!max) {
        throw new Error(
          "No matching versions found: " + JSON.stringify(this.version_range) +
            " in " + JSON.stringify(versions),
        );
      }
      const idx = versions.findIndex((v) => v === max);
      if (idx === -1) {
        throw new Error(
          "Failed to find version: " + JSON.stringify(max) + " in " +
            JSON.stringify(versions),
        );
      }
      item = result[idx];
    }

    const version = item.version_number;
    const files = item.files.filter((f) => f.filename.endsWith(".jar"));
    if (files.length === 0) {
      throw new Error("No download url for version " + JSON.stringify(version));
    }
    let file = files[0];
    if (files.length > 1) {
      let prefix = files[0].filename;
      let suffix = files[0].filename;

      for (let i = 1; i < files.length; i++) {
        const file = files[i].filename;
        let j = 0;
        while (j < prefix.length && j < file.length && prefix[j] === file[j]) {
          j++;
        }
        prefix = prefix.substring(0, j);
        j = 0;
        while (j < suffix.length && j < file.length &&
          suffix[suffix.length - j - 1] === file[file.length - j - 1]) {
          j++;
        }
        suffix = suffix.substring(suffix.length - j);
      }

      const diffs = files.map((f) => f.filename.substring(prefix.length, f.filename.length - suffix.length).toLowerCase());
      let idx = diffs.indexOf("paper");
      if (idx === -1) {
        idx = diffs.indexOf("spigot");
        if (idx === -1) {
          idx = diffs.indexOf("bukkit");
          if (idx === -1) {
            idx = files.findIndex((f) => f.primary);
            if (idx === -1) {
              idx = diffs.indexOf("");
              if (idx === -1) {
                idx = 0;
              }
            }
          }
        }
      }
      file = files[idx];
    }

    return {
      name: this.plugin_name,
      version: version,
      download: {
        url: file.url,
        sha512: file.hashes.sha512,
        size: file.size,
      },
    };
  }
}
