// npm run build:demo: the single-file offline demo (quikfly-demo.html), from any shell on any OS.
// It always uses the built-in mock API: it's the fallback for a demo without internet, and a plain
// `next build` would take the production API from .env.production.
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const OUTPUT = "quikfly-demo.html";
const cwd = fileURLToPath(new URL("..", import.meta.url));

// Windows often has a "python3" that only opens the Microsoft Store, so each name has to prove it runs.
const python = ["python3", "python", "py"].find((name) => spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0);
if (!python) {
  console.error("build:demo needs Python 3 (python3, python or py on the PATH).");
  process.exit(1);
}

function run(command, args, env = process.env) {
  const { status } = spawnSync(command, args, { cwd, env, stdio: "inherit" });
  if (status !== 0) process.exit(status ?? 1);
}

const next = createRequire(import.meta.url).resolve("next/dist/bin/next");
run(process.execPath, [next, "build", "--webpack"], { ...process.env, NEXT_PUBLIC_SPA: "1", NEXT_PUBLIC_API_URL: "" });
// UTF-8 mode: the Windows default code page can't read the Tamil and Hindi strings.
run(python, ["-X", "utf8", "scripts/inline-demo.py", "out", OUTPUT]);
