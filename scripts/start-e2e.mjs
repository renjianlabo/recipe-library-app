import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const port = process.env.E2E_PORT || "3210";
process.env.NEXT_PUBLIC_E2E_MODE = "1";
process.argv = [process.execPath, "next", "dev", "-H", "127.0.0.1", "-p", port];

const require = createRequire(import.meta.url);
require(path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next"));
