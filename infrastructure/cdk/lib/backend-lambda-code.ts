import { execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { BundlingOptions } from "aws-cdk-lib";

/**
 * Bundle FastAPI for Lambda using local pip (no Docker required on deploy machine).
 * Falls back to CDK's Docker bundling image when local bundling fails.
 */
export function backendLambdaBundling(backendPath: string): BundlingOptions {
  return {
    image: lambda.Runtime.PYTHON_3_11.bundlingImage,
    command: [
      "bash",
      "-c",
      [
        "pip install -r requirements-lambda.txt -t /asset-output",
        "cp -r app /asset-output/app",
      ].join(" && "),
    ],
    local: {
      tryBundle(outputDir: string): boolean {
        const reqFile = path.join(backendPath, "requirements-lambda.txt");
        const appDir = path.join(backendPath, "app");
        if (!fs.existsSync(reqFile) || !fs.existsSync(appDir)) {
          return false;
        }

        try {
          fs.mkdirSync(outputDir, { recursive: true });
          execSync(
            [
              "python -m pip install",
              "-r requirements-lambda.txt",
              "-t",
              JSON.stringify(outputDir),
              "--platform manylinux2014_x86_64",
              "--python-version 3.11",
              "--implementation cp",
              "--upgrade",
              "--only-binary=:all:",
            ].join(" "),
            { cwd: backendPath, stdio: "inherit" },
          );
          fs.cpSync(appDir, path.join(outputDir, "app"), { recursive: true });
          return true;
        } catch {
          return false;
        }
      },
    },
  };
}
