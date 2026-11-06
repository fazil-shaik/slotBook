import { spawn } from "child_process";

async function runCommand(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
  });
}

async function main() {
  console.log("=========================================");
  console.log("       SLOTBOOK TEST SUITE RUNNER       ");
  console.log("=========================================");

  try {
    await runCommand("pnpm", ["test:unit"]);
    await runCommand("pnpm", ["test:concurrency"]);
    console.log("=========================================");
    console.log("  🏆 ALL TEST SUITES PASSED FLAWLESSLY!   ");
    console.log("=========================================");
  } catch (err: any) {
    console.error("Test suite failed:", err.message);
    process.exit(1);
  }
}

main();
