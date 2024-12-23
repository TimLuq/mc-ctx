import { type IPluginRequest, Main } from "./ts/main.ts";
const ctxP = fetch(import.meta.url.replace(/[^/]+$/, "context.json")).then(
  (res) => {
    if (res.status == 404) {
      return {};
    }
    if (!res.ok) {
      throw new Error("Failed to fetch context.json");
    }
    return res.json()
  },
  () => ({}),
);

const args = Deno.args;
if (args.length === 0) {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-net --allow-run ./remove.ts <plugin> [<plugin> ...]",
  );
  Deno.exit(1);
}

const plugins: IPluginRequest[] = [];
for (const arg of args) {
  let name = arg;
  let service = "";
  let version: string | undefined = undefined;
  if (name.startsWith("https://hangar.papermc.io/")) {
    service = "Hangar";
    name = name.substring("https://hangar.papermc.io/".length).replace(
      /(\/[^/]*)\/.*$/,
      "$1",
    );
  } else if (name.startsWith("https://dev.bukkit.org/projects/")) {
    service = "Bukkit";
    name = name.substring("https://dev.bukkit.org/projects/".length).replace(
      /\/.*$/,
      "",
    );
  } else if (name.startsWith("https://modrinth.com/plugin/")) {
    service = "Modrinth";
    name = name.substring("https://modrinth.com/plugin/".length).replace(
      /\/.*$/,
      "",
    );
  } else if (/^(?:bukkit:)?[a-zA-Z0-9-]+@.+$/.test(name)) {
    const idx = name.indexOf("@");
    service = "Bukkit";
    version = name.substring(idx + 1);
    name = name.substring(0, idx).replace(/^bukkit:/, "");
  } else if (/^(?:bukkit:)?[a-zA-Z0-9-]+$/.test(name)) {
    service = "Bukkit";
    name = name.replace(/^bukkit:/, "");
  } else if (/^(?:hangar:)?[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+@.+$/.test(name)) {
    const idx = name.indexOf("@");
    service = "Hangar";
    version = name.substring(idx + 1);
    name = name.substring(0, idx).replace(/^hangar:/, "");
  } else if (/^(?:hangar:)?[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(name)) {
    service = "Hangar";
    name = name.replace(/^hangar:/, "");
  } else if (/^(?:modrinth:)?[a-zA-Z0-9-]+@.+$/.test(name)) {
    const idx = name.indexOf("@");
    service = "Modrinth";
    version = name.substring(idx + 1);
    name = name.substring(0, idx).replace(/^modrinth:/, "");
  } else if (/^(?:modrinth:)?[a-zA-Z0-9-]+$/.test(name)) {
    service = "Modrinth";
    name = name.replace(/^modrinth:/, "");
  } else {
    console.error("Unknown plugin format: " + name);
    Deno.exit(1);
  }
  let plugin = name;
  name = name.replace(/^.*\//, "");
  if (service === "Bukkit" || service === "Modrinth") {
    plugin = plugin.toLowerCase();
  }

  plugins.push({
    name,
    service,
    plugin,
    version,
  });
}

const ctx = await ctxP;
if (!Main.validateMainContext(ctx)) {
  throw new Error("Invalid context");
}
const main = new Main(ctx);
main.update(plugins);
if (await main.wait()) {
  const path = "./plugins.json";
  let pluginsJson: IPluginRequest[] = [];
  try {
    const json = await Deno.readTextFile(path);
    pluginsJson = JSON.parse(json);
    if (!Array.isArray(pluginsJson)) {
      throw new Error("Invalid plugins.json");
    }
  } catch (err) {
    if (!(err instanceof Deno.errors.NotFound)) {
      throw err;
    }
  }
  for (const plugin of plugins) {
    const idx = pluginsJson.findIndex((p) => p.name === plugin.name);
    if (idx === -1) {
      pluginsJson.push(plugin);
    } else {
      pluginsJson[idx] = plugin;
    }
  }
  const jsonOut = JSON.stringify(pluginsJson, null, 2);
  await Deno.writeTextFile(path, jsonOut);
}
