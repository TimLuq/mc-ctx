const MainP = import("./ts/main.ts").then((m) => m.Main);
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
const list = fetch(import.meta.url.replace(/[^/]+$/, "plugins.json")).then(
  (res) => res.json(),
);

const Main = await MainP;
const ctx = await ctxP;
if (!Main.validateMainContext(ctx)) {
  throw new Error("Invalid context");
}
const main = new Main(ctx);
const plugins = await list;
main.update(plugins);
await main.wait();
