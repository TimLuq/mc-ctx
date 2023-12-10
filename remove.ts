import { type IPluginRequest, Main } from "./ts/main.ts";

const args = Deno.args;
if (args.length === 0) {
  console.error(
    "Usage: deno run --allow-read --allow-write --allow-net --allow-run ./add.ts <plugin> [<plugin> ...]",
  );
  Deno.exit(1);
}

const plugins: IPluginRequest[] = [];
for (const arg of args) {
  let name = arg;
  let service = "";
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
  } else if (/^bukkit:[a-zA-Z0-9-]+$/.test(name)) {
    service = "Bukkit";
    name = name.replace(/^bukkit:/, "");
  } else if (/^(?:hangar:)?[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(name)) {
    service = "Hangar";
    name = name.replace(/^hangar:/, "");
  } else if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    console.error("Unknown plugin format: " + name);
    Deno.exit(1);
  }
  let plugin = name;
  name = name.replace(/^.*\//, "");
  if (service === "Bukkit") {
    plugin = plugin.toLowerCase();
  }

  plugins.push({
    name,
    service,
    plugin,
  });
}

const main = new Main();
main.remove(plugins);
await main.wait();
