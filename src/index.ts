import { parseCli } from "./cli.js";

const options = parseCli();
if (options.command === "generate") {
    const { runGenerate } = await import("./generate/index.js");
    await runGenerate(options);
} else {
    const { runPull } = await import("./pull.js");
    await runPull(options);
}
