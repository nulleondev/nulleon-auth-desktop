import { fileURLToPath } from "node:url";

// A Git ignore rule does not prevent Vite from serving a local file.
export function privateDevServer(configUrl) {
  return {
    host: "127.0.0.1",
    strictPort: true,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL(".", configUrl)),
        fileURLToPath(new URL("../shared", configUrl)),
      ],
      deny: [
        ".env",
        ".env.*",
        "*.{crt,pem,key,p12,pfx,jks,keystore}",
        "**/.git/**",
        "**/*.nauth",
        "**/*.nauth.*",
        "**/*.sqlite",
        "**/*.sqlite3",
        "**/*.db",
        "**/.cache/**",
        "**/.safety-backups/**",
        "**/infra/data/**",
        "**/private/**",
        "**/exports/**",
        "**/backups/**",
        "**/captures/**",
        "**/credentials.json",
        "**/service-account*.json",
        "**/vault*.json",
        "**/2fa-export*.json",
        "**/notes-export*.json",
        "**/authenticator-export*.json",
      ],
    },
  };
}
