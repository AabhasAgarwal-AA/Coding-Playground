export const languages = [
    {
        value: "cpp",
        label: "C++",
        filename: "main.cpp",
        prismLanguage: "cpp",
    },
    {
        value: "js",
        label: "JavaScript",
        filename: "main.js",
        prismLanguage: "javascript",
    },
    {
        value: "py",
        label: "Python",
        filename: "main.py",
        prismLanguage: "python",
    },
] as const;

export type Language = (typeof languages)[number]["value"];

export const initialCode: Record<Language, string> = {
    cpp: `#include <iostream>

int main() {
  std::cout << "Hello, world!" << std::endl;
  return 0;
}
`,
    js: `function main() {
  console.log("Hello, world!");
}

main();
`,
    py: `def main():
    print("Hello, world!")


if __name__ == "__main__":
    main()
`,
};

export function getLanguageDetails(language: Language) {
    return (
        languages.find((item) => item.value === language) ??
        languages[0]
    );
}