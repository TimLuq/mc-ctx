import type { SemVerRange } from "https://deno.land/std@0.208.0/semver/types.ts";
import type {
  IPluginService,
  IPluginSource,
  IPluginVersion,
} from "./service.ts";

import {
  DOMParser,
} from "https://deno.land/x/deno_dom@v0.1.43/deno-dom-wasm.ts";

export class Bukkit implements IPluginService {
  public readonly name: string = "json";

  public plugin_source(
    plugin: string,
    version_range?: SemVerRange,
  ): IPluginSource {
    return new BukkitSource(this, plugin, version_range);
  }
}

class BukkitSource implements IPluginSource {
  public readonly full_name: string;
  public readonly service: Bukkit;

  private readonly version_range?: SemVerRange;

  public get plugin_name(): string {
    return this.full_name.replace(/^.*\//, "");
  }

  public constructor(
    service: Bukkit,
    full_name: string,
    version_range?: SemVerRange,
  ) {
    this.full_name = full_name;
    this.service = service;
    this.version_range = version_range;
  }

  public async latest_version(): Promise<IPluginVersion> {
    const res = await fetch(
      `https://dev.bukkit.org/projects/${this.full_name}/files`,
    );
    const json = await res.text();
    const doc = new DOMParser().parseFromString(json, "text/html");
    if (!doc) {
      throw new Error("Failed to parse html");
    }
    const latest = doc.querySelector(".project-file-list-item");
    if (!latest) {
      throw new Error("Failed to find latest version");
    }

    let version = latest.querySelector(".project-file-name-container")
      ?.textContent?.trim();
    if (!version) {
      throw new Error("Failed to find version");
    }
    version = version.replace(/\(.*$/, "").trim().replace(/^\D+/, "").replace(
      /[^0-9.]+$/g,
      "-",
    );

    let downloadE = latest.querySelector(".project-file-download-button");
    if (!downloadE) {
      throw new Error("Failed to find download url");
    }
    if (downloadE.localName.toLowerCase() !== "a") {
      downloadE = downloadE.querySelector("a");
      if (!downloadE) {
        throw new Error("Failed to find download url");
      }
    }
    let download = downloadE.getAttribute("href");
    if (!download) {
      throw new Error("Failed to find download url");
    }
    if (!download.startsWith("https:")) {
      download = "https://dev.bukkit.org" + download;
    }

    return {
      name: this.plugin_name,
      version,
      download: {
        url: download,
      },
    };
  }
}
