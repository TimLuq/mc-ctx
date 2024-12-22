import { CurrentlyInstalled, IPluginInstalled } from "./currently-installed.ts";
import { Hangar } from "./hangar.ts";
import { JsonFetch } from "./json.ts";
import { Bukkit } from "./bukkit.ts";
import { JarFetch } from "./jar.ts";
import type { IPluginVersion } from "./service.ts";

import { encodeHex } from "https://deno.land/std@0.208.0/encoding/hex.ts";
import { crypto } from "https://deno.land/std@0.208.0/crypto/mod.ts";

import type { SemVerRange } from "https://deno.land/std@0.208.0/semver/types.ts";
import { parseRange } from "https://deno.land/std@0.208.0/semver/parse_range.ts";

export interface IPluginRequest {
  name: string;
  service: string;
  plugin: string;
  version?: string;
  versionRange?: SemVerRange;
}

export interface IMainContext {
  chown?: { uid: number | null; gid: number | null };
}

export class Main {
  private readonly currentlyInstalled = new CurrentlyInstalled();
  private readonly hangar = new Hangar();
  private readonly jsonFetch = new JsonFetch();
  private readonly bukkit = new Bukkit();
  private readonly jarFetch = new JarFetch();

  private readonly pluginDir = "./plugins";
  private readonly chown: undefined | { uid: number | null; gid: number | null } = undefined;
  private readonly completed: Array<Promise<boolean>> = [];

  public constructor(options?: IMainContext) {
    this.chown = options?.chown;
  }

  public static validateMainContext(
    context: unknown,
  ): context is IMainContext {
    if (typeof context !== "object" || context === null) {
      return false;
    }
    {
      const chown = (context as { chown?: unknown }).chown;
      if (chown !== undefined) {
        if (typeof chown !== "object" || chown === null) {
          throw new Error("context.chown must be an object");
        }
        if (typeof (chown as { uid?: unknown }).uid !== "number" &&
          (chown as { uid?: unknown }).uid !== null) {
          throw new Error("context.chown.uid must be a number or null");
        }
        if (typeof (chown as { gid?: unknown }).gid !== "number" &&
          (chown as { gid?: unknown }).gid !== null) {
          throw new Error("context.chown.gid must be a number or null");
        }
        for (const key in chown) {
          if (!["uid", "gid"].includes(key)) {
            console.warn(`Unknown key in context.chown: ${JSON.stringify(key)}`);
          }
        }
      }
    }
    for (const key in context) {
      if (!["chown"].includes(key)) {
        console.warn(`Unknown key in context: ${JSON.stringify(key)}`);
      }
    }
    return true;
  }

  public update(plugins: IPluginRequest[]) {
    for (const plugin of plugins) {
      const verRange = plugin.version as unknown as string | undefined;
      if (verRange) {
        plugin.versionRange = parseRange(verRange);
      } else {
        plugin.versionRange = undefined;
      }
      const p = this.processPlugin(plugin).then(([prevVersion, newVersion]) => {
        if (!prevVersion) {
          console.log(`+ Installed: ${plugin.name} (${newVersion.version})`);
        } else if (prevVersion.version === newVersion.version) {
          console.log(`# Up-to-date: ${plugin.name} (${newVersion.version})`);
        } else {
          console.log(`- Updated: ${plugin.name} ${prevVersion.version}`);
          console.log(`+ Updated: ${plugin.name} ${newVersion.version}`);
        }
        return true;
      }, (err) => {
        console.error("Error: ", err, "  " + JSON.stringify(plugin, null));
        return false;
      });
      this.completed.push(p);
    }
  }

  private getService(service: string): Hangar | Bukkit | JsonFetch | null {
    if (service === "Hangar") {
      return this.hangar;
    } else if (service === "Bukkit") {
      return this.bukkit;
    } else if (service === "json") {
      return this.jsonFetch;
    } else if (service === "jar") {
      return this.jarFetch;
    } else {
      return null;
    }
  }

  public list() {
    this.completed.push(
      this.currentlyInstalled.list().then((list) => {
        const compl = [];
        for (const plugin of list) {
          const service = this.getService(plugin.service);
          let item;
          if (service) {
            const source = service.plugin_source(
              plugin.plugin,
              plugin.versionRange,
            );
            item = source.latest_version().then((ver) => {
              if (ver.version === plugin.version) {
                return `(latest)`;
              } else {
                return `(${ver.version} at ${service.name})`;
              }
            }, (err) => {
              return `(error: ${err})`;
            });
          } else {
            item = Promise.resolve("(unknown service)");
          }
          compl.push(item.then((ver) => {
            console.log(`* ${plugin.name}: ${plugin.version} ${ver}`);
          }));
        }
        return Promise.all(compl).then(() => true);
      }),
    );
  }

  public remove(plugins: IPluginRequest[]): Promise<true> {
    const res = [];
    for (const plugin of plugins) {
      res.push(this.currentlyInstalled.remove(plugin));
    }
    const ret: Promise<true> = Promise.all(res).then((list) => {
      for (const plugin of list) {
        if (plugin) {
          console.log(`- Removed: ${plugin.name} ${plugin.version}`);
        }
      }
      return true;
    });
    this.completed.push(ret);
    return ret;
  }

  public async wait(): Promise<boolean> {
    let result: boolean[] = [];
    let l = -1;
    while (this.completed.length != l) {
      l = this.completed.length;
      const all = Promise.all(this.completed);
      result = await all;
    }
    if (this.currentlyInstalled.needsSave) {
      await this.currentlyInstalled.save();
    }
    return result.every((v) => v);
  }

  private async processPlugin(
    plugin: IPluginRequest,
  ): Promise<[IPluginInstalled | null, IPluginVersion]> {
    const service = this.getService(plugin.service);
    if (!service) {
      throw new Error("Unknown service: " + plugin.service);
    }
    const source = service.plugin_source(plugin.plugin, plugin.versionRange);
    const ver = await source.latest_version();
    const expectedName = plugin.name + "-" + ver.version + ".jar";
    const installed = await this.checkInstalled(plugin);
    if (installed?.version === ver.version) {
      return [installed, ver];
    }
    const [tmpFile, inst] = await this.downloadFile(plugin, ver);
    const expectedPath = this.pluginDir + "/" + expectedName;
    if (this.chown) {
      await Deno.chown(tmpFile, this.chown.uid, this.chown.gid);
    }
    await Deno.rename(tmpFile, expectedPath);
    const rem = await this.currentlyInstalled.add(inst);
    if (rem) {
      const srcPath = this.pluginDir + "/" + rem.name + "-" + rem.version +
        ".jar";
      const dstPath = this.pluginDir + ".old/" + rem.name + "-" + rem.version +
        ".jar";
      await Deno.rename(srcPath, dstPath);
    }
    return [installed, ver];
  }

  async downloadFile(
    plugin: IPluginRequest,
    ver: IPluginVersion,
  ): Promise<[string, IPluginInstalled]> {
    const tmpFile = await Deno.makeTempFile({
      prefix: "mcp-",
      suffix: ".dwn.tmp",
    });
    const downloadTo = await Deno.open(tmpFile, { create: true, write: true });
    try {
      let url = ver.download.url;
      const ghMatch =
        /^https:\/\/github\.com\/([^/]+\/[^/]+)\/releases\/tag\/([^/]+)$/.exec(
          url,
        );
      if (ghMatch) {
        const [_, repo, tag] = ghMatch;
        url =
          `https://github.com/${repo}/releases/download/${tag}/${plugin.name}-${ver.version}.jar`;
      }
      await this.downloadFileTo(url, downloadTo);
      try {
        downloadTo.close();
      } catch (err) {
        if (!(err instanceof Deno.errors.BadResource)) {
          throw err;
        }
      }
      const file = await Deno.open(tmpFile, { read: true });
      const statP = file.stat();
      const readableStream = file.readable;
      const fileHashBuffer = await crypto.subtle.digest(
        "SHA-256",
        readableStream,
      );
      const fileHash = encodeHex(fileHashBuffer);
      if (
        ver.download.sha256 !== undefined && ver.download.sha256 !== fileHash
      ) {
        throw new Error(
          "Downloaded file hash mismatch: " + ver.download.sha256 + " != " +
            fileHash,
        );
      }
      const stat = await statP;
      const installed: IPluginInstalled = {
        ...plugin,
        versionRange: undefined,
        version: ver.version,
        url: ver.download.url,
        sha256: fileHash,
        size: stat.size,
        installed: stat.mtime?.getTime() ?? Date.now(),
      };
      return [tmpFile, installed];
    } catch (err) {
      await Deno.remove(tmpFile);
      throw err;
    }
  }

  async downloadFileTo(url: string, dest: Deno.FsFile): Promise<void> {
    const res = await fetch(url);
    return res.body?.pipeTo(dest.writable);
  }

  private checkInstalled(
    plugin: IPluginRequest,
  ): Promise<IPluginInstalled | null> {
    return this.currentlyInstalled.get(plugin);
  }
}
