import type { IPluginRequest } from "./main.ts";
import type { IPluginDownload } from "./service.ts";

export interface IPluginInstalled
  extends IPluginRequest, Required<IPluginDownload> {
  version: string;
  versionRange?: undefined;
  /** The epoch in ms */
  installed: number;
}

interface IPluginRemoved extends IPluginInstalled {
  /** The epoch in ms */
  removed: number;
}

interface InstallLog {
  current: IPluginInstalled[];
  history: Record<string, IPluginInstalled[]>;
}

/** A container for the list of installed plugins. */
export class CurrentlyInstalled {
  private hasLoaded = false;
  private readonly installLog: Promise<InstallLog>;
  private _needsSave = false;
  private _currentSave: null | Promise<void> = null;

  constructor() {
    this.installLog = this.load();
  }

  public get needsSave(): boolean {
    return this._needsSave;
  }

  private async load(): Promise<InstallLog> {
    try {
      const list = Deno.readFile("./installed-plugins.json");
      const json = new TextDecoder().decode(await list);
      const installLog = JSON.parse(json);
      this.hasLoaded = true;
      return installLog;
    } catch (err) {
      if (err instanceof Deno.errors.NotFound) {
        return {
          current: [],
          history: {},
        };
      }
      throw err;
    }
  }

  public async list(): Promise<
    Readonly<ReadonlyArray<Readonly<IPluginInstalled>>>
  > {
    const log = await this.installLog;
    return log.current;
  }

  public async save(): Promise<void> {
    const log = await this.installLog;
    while (this._currentSave) {
      await this._currentSave;
    }
    if (!this._needsSave) {
      return;
    }
    const s = this.saveImpl(log);
    this._currentSave = s.then(() => {
      this._currentSave = null;
    }, (err) => {
      this._currentSave = null;
      console.error("Error saving log of installed plugins: ", err);
    });
  }

  private async saveImpl(log: InstallLog): Promise<void> {
    const json = JSON.stringify(log, null, 2);
    await Deno.writeFile(
      "./installed-plugins.json",
      new TextEncoder().encode(json),
    );
    this._needsSave = false;
  }

  public async add(
    plugin: IPluginInstalled,
  ): Promise<null | false | Readonly<IPluginRemoved>> {
    const log = await this.installLog;
    const foundindex = log.current.findIndex((p) => p.name === plugin.name);
    if (foundindex === -1) {
      log.current.push(plugin);
      this._needsSave = true;
      return null;
    }
    const found = log.current[foundindex];
    if (found.version === plugin.version) {
      return false;
    }
    const rem = found as IPluginRemoved;
    rem.removed = plugin.installed;
    const hist = log.history[plugin.name] = log.history[plugin.name] ?? [];
    hist.unshift(rem);
    log.current[foundindex] = plugin;
    this._needsSave = true;
    return rem;
  }

  public async remove(
    plugin: IPluginRequest,
  ): Promise<null | Readonly<IPluginRemoved>> {
    const log = await this.installLog;
    const foundindex = log.current.findIndex((p) =>
      (p.name === plugin.name || p.plugin === plugin.plugin) &&
      (!plugin.service || p.service === plugin.service)
    );
    if (foundindex === -1) {
      return null;
    }
    const found = log.current.splice(foundindex, 1)[0];
    const rem = found as IPluginRemoved;
    rem.removed = Date.now();
    const hist = log.history[rem.name] = log.history[rem.name] ?? [];
    hist.unshift(rem);
    this._needsSave = true;
    return rem;
  }

  public async get(
    plugin: IPluginRequest,
  ): Promise<Readonly<IPluginInstalled> | null> {
    const log = await this.installLog;
    const found = log.current.find((p) => p.name === plugin.name);
    return found ?? null;
  }
}
