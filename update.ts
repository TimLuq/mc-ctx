const MainP = import("./ts/main.ts").then((m) => m.Main);
const list = fetch(import.meta.url.replace(/[^/]+$/, "plugins.json")).then(
  (res) => res.json()
);

const Main = await MainP;
const plugins = await list;
const main = new Main();
main.update(plugins);
await main.wait();
