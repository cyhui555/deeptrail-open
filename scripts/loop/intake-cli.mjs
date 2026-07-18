import process from "node:process";

import { formatError, LoopGatewayError } from "./errors.mjs";
import { inspectIssueIntake } from "./intake.mjs";

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--issue" || !/^[1-9]\d*$/.test(args[1])) {
    throw new LoopGatewayError("USAGE", "用法：loop:intake -- --issue <positive-number>");
  }
  const result = await inspectIssueIntake(Number(args[1]));
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify(formatError(error), null, 2)}\n`);
  process.exitCode = 1;
});
