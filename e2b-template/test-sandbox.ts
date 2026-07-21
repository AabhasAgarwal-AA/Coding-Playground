import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("coding-playground");

const result = await sandbox.commands.run(`
  node --version &&
  npm --version &&
  python3 --version &&
  pip3 --version &&
  g++ --version &&
  gcc --version
`);

console.log(result.stdout);
console.error(result.stderr);

await sandbox.kill();
