import type {
  IPluginService,
  IPluginSource,
  IPluginVersion,
} from "./service.ts";

export class JarFetch implements IPluginService {
  public readonly name: string = "jar";

  public plugin_source(plugin: string): IPluginSource {
    return new JarSource(this, plugin);
  }
}

class JarSource implements IPluginSource {
  public readonly full_name: string;
  public readonly service: JarFetch;

  public get plugin_name(): string {
    return this.full_name.replace(/^.*\//, "");
  }

  public constructor(service: JarFetch, full_name: string) {
    this.full_name = full_name;
    this.service = service;
  }

  public async latest_version(): Promise<IPluginVersion> {
    let res = await fetch(this.full_name, { method: "HEAD" });
    while (res.status > 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) {
        throw new Error("Redirect without location");
      }
      res = await fetch(loc, { method: "HEAD" });
    }
    if (!res.ok) {
      throw new Error("Failed to fetch: " + res.statusText);
    }

    const lastModified = res.headers.get("last-modified");
    if (!lastModified) {
      throw new Error(
        "Direct JAR service can only be used if last-modified header is set",
      );
    }
    const lastMod = new Date(lastModified);
    if (isNaN(lastMod.getTime())) {
      throw new Error("Failed to parse last-modified header");
    }
    const version = lastMod.toISOString().replace(/\..*$/, "").replace(/Z$/, "")
      .replace(/[:-]/g, "");
    const download = res.url;
    const name = this.plugin_name.replace(/\.jar$/, "").replace(
      /^.*\/(.)/,
      "$1",
    );

    return {
      name,
      version,
      download: {
        url: download,
      },
    };
  }
}
