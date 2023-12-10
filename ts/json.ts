import type {
  IPluginService,
  IPluginSource,
  IPluginVersion,
} from "./service.ts";

export class JsonFetch implements IPluginService {
  public readonly name: string = "json";

  public plugin_source(plugin: string): IPluginSource {
    return new JsonSource(this, plugin);
  }
}

interface IScrapeParams {
  readonly url: string;
  readonly dwn: string;
  readonly ver: string;
  readonly nam: string;
}

const parseFull = (url: string): IScrapeParams => {
  const u = new URL(url);
  const params = new URLSearchParams(u.hash.replace(/^#/, ""));
  const dwn = params.get("dwn");
  const ver = params.get("ver");
  const nam = params.get("nam");
  if (!dwn || !ver || !nam) {
    throw new Error(
      "Invalid url: " + JSON.stringify(url) + " (missing dwn, nam or ver)",
    );
  }
  return {
    url: u.origin + u.pathname,
    dwn,
    ver,
    nam,
  };
};

class JsonSource implements IPluginSource {
  public readonly full_name: string;
  public readonly service: JsonFetch;

  public get plugin_name(): string {
    return this.full_name.replace(/^.*\//, "");
  }

  public constructor(service: JsonFetch, full_name: string) {
    this.full_name = full_name;
    this.service = service;
  }

  public async latest_version(): Promise<IPluginVersion> {
    const params = parseFull(this.full_name);
    const res = await fetch(params.url);
    const json = await res.json();

    let version = json;
    if (params.ver.startsWith("/")) {
      for (const v of params.ver.substring(1).split("/")) {
        version = version[v];
      }
    } else {
      version = params.ver;
    }
    if (typeof version !== "string") {
      throw new Error("Invalid version: " + JSON.stringify(version));
    }

    let download = json;
    if (params.dwn.startsWith("/")) {
      for (const v of params.dwn.substring(1).split("/")) {
        download = download[v];
      }
    } else {
      download = params.dwn;
    }

    let name = json;
    if (params.nam.startsWith("/")) {
      for (const v of params.nam.substring(1).split("/")) {
        name = name[v];
      }
    } else {
      name = params.nam;
    }

    return {
      name,
      version,
      download: {
        url: download,
      },
    };
  }
}
