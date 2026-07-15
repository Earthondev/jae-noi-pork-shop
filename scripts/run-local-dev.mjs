import { spawn } from "node:child_process";

const child = spawn(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["exec", "--", "vinext", "dev", "--port", "3000", "--strictPort"],
  { env: process.env, stdio: "inherit" },
);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error("เปิด local server ไม่สำเร็จ", error.message);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1);
});
