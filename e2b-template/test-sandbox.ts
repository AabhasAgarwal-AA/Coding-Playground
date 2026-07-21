import { Sandbox } from "e2b";

const sandbox = await Sandbox.create("coding-playground");

// const result = await sandbox.commands.run(`
//   node --version &&
//   npm --version &&
//   python3 --version &&
//   pip3 --version &&
//   g++ --version &&
//   gcc --version
// `);

// console.log(result.stdout);
// console.error(result.stderr);

// await sandbox.kill();


await sandbox.files.write(
    "/home/user/main.py",
    `
print("Hello from Python in E2B")
`
);

await sandbox.files.write(
    "/home/user/main.cpp",
    `
#include <iostream>

int main() {
    std::cout << "Hello from C++ in E2B" << std::endl;
    return 0;
}
`
);

const pythonResult = await sandbox.commands.run(
    "python3 /home/user/main.py"
);

console.log(pythonResult.stdout);

const cppResult = await sandbox.commands.run(
    "g++ /home/user/main.cpp -o /home/user/main && /home/user/main"
);

console.log(cppResult.stdout);

console.log("Sandbox ID:", sandbox.sandboxId);

await sandbox.kill();
