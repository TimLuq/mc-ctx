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

interface IHangarVersion {
  pagination: {
    limit: number;
    offset: number;
    count: number;
  };
  result: IHangarVersionItem[];
}

interface IHangarVersionItem {
  /** iso datetime */
  createdAt: string;
  /** version string */
  name: string;
  visibility: "public";
  description: string;
  stats: {
    totalDownloads: number;
    platformDownloads: {
      PAPER: number;
    };
  };
  author: string;
  reviewState: string;
  channel: {
    /** iso datetime */
    createdAt: string;
    name: string;
    description: null;
    /** color hexcode */
    color: string;
    flags: ("PINNED" | "SENDS_NOTIFICATIONS" | "FROZEN")[];
  };
  pinnedStatus: string | null;
  downloads: {
    PAPER: {
      fileInfo: null | {
        /** filename */
        name: string;
        /** bytes */
        sizeBytes: number;
        /** hash as a hex string */
        sha256Hash: string;
      };
      /** external download url */
      externalUrl: string | null;
      /** direct download url */
      downloadUrl: string | null;
    };
  };
  pluginDependencies: unknown;
  platformDependencies: {
    /** platform versions supported */
    PAPER: string[];
  };
  platformDependenciesFormatted: {
    PAPER: string;
  };
}

export class Hangar implements IPluginService {
  public readonly name: string = "Hangar";

  public plugin_source(
    plugin: string,
    version_range?: SemVerRange,
  ): IPluginSource {
    return new HangarSource(this, plugin, version_range);
  }
}

class HangarSource implements IPluginSource {
  public readonly full_name: string;
  public readonly service: Hangar;

  private readonly version_range?: SemVerRange;

  public get plugin_name(): string {
    return this.full_name.replace(/^.*\//, "");
  }

  public constructor(
    hangar: Hangar,
    full_name: string,
    version_range?: SemVerRange,
  ) {
    this.full_name = full_name;
    this.service = hangar;
    this.version_range = version_range;
  }

  public async latest_version(): Promise<IPluginVersion> {
    const res = await fetch(
      `https://hangar.papermc.io/api/v1/projects/${this.plugin_name}/versions`,
    );
    const json: IHangarVersion = await res.json();
    if (json.result.length === 0) {
      throw new Error("No versions found");
    }
    let item = json.result[0];
    if (this.version_range) {
      const versions = json.result.map((v) => {
        try {
          return parseSemver(v.name);
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
      item = json.result[idx];
    }

    const version = item.name;
    const download = item.downloads.PAPER.downloadUrl ??
      item.downloads.PAPER.externalUrl;
    if (download === null) {
      throw new Error("No download url for version " + JSON.stringify(version));
    }
    return {
      name: this.plugin_name,
      version: version,
      download: {
        url: download,
        sha256: item.downloads.PAPER.fileInfo?.sha256Hash,
        size: item.downloads.PAPER.fileInfo?.sizeBytes,
      },
    };
  }
}
