export interface IPluginVersion {
  readonly name: string;
  readonly version: string;
  readonly download: IPluginDownload;
}

export interface IPluginDownload {
  readonly url: string;
  readonly sha256?: string;
  readonly sha512?: string;
  readonly size?: number;
}

export interface IPluginSource {
  readonly plugin_name: string;
  readonly service: IPluginService;

  /**
   * Return the latest version of the plugin.
   *
   * @returns the latest version of the plugin
   */
  latest_version(): Promise<IPluginVersion>;
}

export interface IPluginService {
  readonly name: string;
  plugin_source(plugin: string): IPluginSource;
}
