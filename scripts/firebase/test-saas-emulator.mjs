import { spawnSync } from "node:child_process";

const commands = [
  ["Rules authorization and tenant isolation", ["--test", "functions/tests/firestore/subscriptions.rules.test.mjs"]],
  ["Callable plan registration and role authorization", ["functions/tests/emulator/subscription-callable.test.mjs"]],
];

for (const [label, args] of commands) {
  console.log(`\n--- ${label} ---`);
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
