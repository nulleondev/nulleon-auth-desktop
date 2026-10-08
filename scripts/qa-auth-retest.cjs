// Browser regression against synthetic IPC only; native tests run separately.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1040, height: 780 } });
  const checks = [],
    errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  const check = (n, v) => {
    assert.ok(v, n);
    checks.push(n);
  };
  await p.addInitScript(() => {
    const original = [
      {
        id: "qa1",
        type: "totp",
        name: "Synthetic account",
        secret: "JBSWY3DPEHPK3PXP",
        issuer: "QA",
        digits: 6,
        period: 30,
        algo: "SHA-1",
      },
      {
        id: "qa2",
        type: "note",
        name: "Synthetic note",
        content: "Synthetic private note",
      },
    ];
    window.qa = {
      items: original,
      mode: "ok",
      scanCalls: 0,
      writeCalls: 0,
      saves: [],
      clipboard: "",
      error: "QR_NOT_FOUND",
    };
    Object.defineProperty(navigator, "clipboard", {
      value: {
        readText: async () => qa.clipboard,
        writeText: async (value) => {
          qa.clipboard = value;
        },
      },
    });
    window.__TAURI_INTERNALS__ = {
      invoke: async (command, args) => {
        if (command === "plugin:clipboard-manager|read_text")
          return qa.clipboard;
        if (command === "plugin:clipboard-manager|write_text") {
          qa.clipboard = args.text;
          return;
        }
        if (command === "find_and_read_vault")
          return {
            content: "synthetic-encrypted",
            path: "/synthetic/vault.nauth",
          };
        if (command === "unlock_vault") {
          if (args.password !== "synthetic-password") throw Error("invalid");
          return JSON.stringify({ vaultVersion: 2, items: qa.items });
        }
        if (
          command === "scan_qr_from_screen" ||
          command === "scan_qr_from_image"
        ) {
          qa.scanCalls++;
          if (args?.imageData) qa.imageSize = args.imageData.length;
          if (qa.mode === "error") throw qa.error;
          if (qa.mode === "deferred")
            return new Promise((resolve) => {
              qa.resolveScan = resolve;
            });
          return {
            account: "Imported QA",
            issuer: "QA Lab",
            secret: "JBSWY3DPEHPK3PXP",
            digits: 8,
            algorithm: "SHA-256",
            period: 60,
          };
        }
        if (command === "save_existing_vault") {
          qa.saves.push(JSON.parse(args.data));
          return args.data;
        }
        if (command === "write_vault_file") {
          qa.writeCalls++;
          if (qa.mode === "write-error") throw Error("synthetic write failure");
          if (qa.mode === "save-deferred")
            await new Promise((resolve) => {
              qa.resolveSave = resolve;
            });
          qa.items = JSON.parse(args.content).items;
          return;
        }
        throw Error("Unexpected command");
      },
    };
  });
  await p.clock.install();
  await p.goto("http://127.0.0.1:1420/");
  await p.getByRole("button", { name: "Acessar meu cofre" }).click();
  await p
    .getByRole("textbox", { name: "Senha mestra" })
    .fill("synthetic-password");
  await p.getByRole("button", { name: "Desbloquear", exact: true }).click();
  await p.getByRole("heading", { name: "Meu cofre" }).waitFor();
  await p.getByRole("button", { name: "Pausar animações" }).click();
  const open = () => p.getByRole("button", { name: "Adicionar item" }).click();
  const scan = () => p.getByRole("button", { name: "Ler QR da tela" }).click();
  const cancel = () =>
    p.getByRole("button", { name: "Cancelar", exact: true }).click();
  await open();
  await scan();
  await p.getByText("QR lido. Confira os dados antes de salvar.").waitFor();
  check(
    "Scan preserves decoded account",
    (await p
      .getByRole("textbox", { name: "Título", exact: true })
      .inputValue()) === "Imported QA",
  );
  check(
    "Imported secret remains masked",
    (await p.getByLabel("Chave secreta 2FA").getAttribute("type")) ===
      "password",
  );
  check(
    "Scan does not save automatically",
    await p.evaluate(() => qa.writeCalls === 0),
  );
  check(
    "QR settings shown for review",
    await p.getByText(/SHA-256 · 8 dígitos · 60 s/).isVisible(),
  );
  await p.getByRole("button", { name: "Salvar com criptografia" }).click();
  await p.getByRole("button", { name: /Imported QA/ }).waitFor();
  check(
    "Saved QR preserves period and algorithm",
    await p.evaluate(() =>
      qa.items.some(
        (i) =>
          i.name === "Imported QA" &&
          i.period === 60 &&
          i.digits === 8 &&
          i.algo === "SHA-256",
      ),
    ),
  );
  await p.getByRole("button", { name: /Imported QA/ }).click();
  await p.getByRole("button", { name: "Revelar código" }).click();
  check(
    "Imported account generates eight digits",
    /^\d{4} \d{4}$/.test(await p.locator(".totp-display").innerText()),
  );
  await p.keyboard.press("Escape");
  for (const [code, text] of [
    ["QR_CAPTURE_FAILED", "Não foi possível capturar"],
    ["QR_MULTIPLE", "Há mais de um"],
    ["QR_UNSUPPORTED_TYPE", "Este QR usa HOTP"],
    ["QR_MIGRATION_UNSUPPORTED", "QR de exportação"],
    ["QR_WAYLAND_UNSUPPORTED", "Nesta sessão Wayland"],
  ]) {
    await p.evaluate((code) => {
      qa.mode = "error";
      qa.error = code;
    }, code);
    await open();
    await scan();
    await p.getByText(new RegExp(text)).waitFor();
    check(
      `${code} shown without leaking content`,
      (await p.getByLabel("Chave secreta 2FA").inputValue()) === "",
    );
    await cancel();
  }
  await p.evaluate(() => {
    qa.mode = "ok";
  });
  await open();
  await p
    .getByLabel("Imagem do QR")
    .setInputFiles({
      name: "synthetic.png",
      mimeType: "image/png",
      buffer: Buffer.from("synthetic-image-bridge-fixture"),
    });
  await p.getByRole("textbox", { name: "Título", exact: true }).waitFor();
  await p.getByText("QR lido. Confira os dados antes de salvar.").waitFor();
  check(
    "Image bytes passed to native decoder",
    await p.evaluate(() => qa.imageSize === 30),
  );
  await p.getByRole("button", { name: "Mostrar chave" }).click();
  await p.evaluate(() => window.dispatchEvent(new Event("blur")));
  check(
    "Window blur masks secret input",
    (await p.getByLabel("Chave secreta 2FA").getAttribute("type")) ===
      "password",
  );
  await p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await cancel();
  await open();
  check(
    "Cancel clears secret draft",
    (await p.getByLabel("Chave secreta 2FA").inputValue()) === "",
  );
  await cancel();
  await p.evaluate(() => {
    qa.mode = "deferred";
  });
  await open();
  await scan();
  check(
    "Duplicate scan disabled",
    await p.getByRole("button", { name: "Lendo em memória…" }).isDisabled(),
  );
  check(
    "Save disabled while scan pending",
    await p
      .getByRole("button", { name: "Salvar com criptografia" })
      .isDisabled(),
  );
  await cancel();
  await p.evaluate(() =>
    qa.resolveScan({
      account: "Stale QA",
      issuer: "QA",
      secret: "JBSWY3DPEHPK3PXP",
      digits: 6,
      algorithm: "SHA-1",
      period: 30,
    }),
  );
  await open();
  check(
    "Cancelled scan cannot restore draft",
    (await p
      .getByRole("textbox", { name: "Título", exact: true })
      .inputValue()) === "",
  );
  await cancel();
  await p.evaluate(() => {
    qa.mode = "write-error";
  });
  await open();
  await p.getByRole("button", { name: "Nota", exact: true }).click();
  await p
    .getByRole("textbox", { name: "Título", exact: true })
    .fill("Unsaved note");
  await p
    .getByRole("textbox", { name: "Conteúdo da nota" })
    .fill("Synthetic only");
  const initial = await p.evaluate(() => qa.items.length);
  await p.getByRole("button", { name: "Salvar com criptografia" }).click();
  await p.getByText(/Não foi possível salvar com segurança/).waitFor();
  check(
    "Failed write preserves existing items",
    (await p.evaluate(() => qa.items.length)) === initial,
  );
  check(
    "Failed write keeps draft for recovery",
    (await p
      .getByRole("textbox", { name: "Conteúdo da nota" })
      .inputValue()) === "Synthetic only",
  );
  await p.evaluate(() => {
    qa.mode = "save-deferred";
  });
  await p.getByRole("button", { name: "Salvar com criptografia" }).click();
  check(
    "Save is single-flight",
    await p
      .getByRole("button", { name: "Salvar com criptografia" })
      .isDisabled(),
  );
  await p.evaluate(() => qa.resolveSave());
  await p.getByRole("button", { name: /Unsaved note/ }).waitFor();
  await p.getByRole("button", { name: /Synthetic note/ }).click();
  await p.getByRole("button", { name: "Copiar", exact: true }).click();
  check(
    "Copy uses selected note",
    (await p.evaluate(() => qa.clipboard)) === "Synthetic private note",
  );
  await p.keyboard.press("Escape");
  await p.clock.fastForward(31000);
  check(
    "Owned clipboard cleared after timeout",
    (await p.evaluate(() => qa.clipboard)) === "",
  );
  await p.getByRole("button", { name: /Synthetic note/ }).click();
  await p.getByRole("button", { name: "Copiar", exact: true }).click();
  await p.evaluate(() => {
    qa.clipboard = "unrelated clipboard";
  });
  await p.keyboard.press("Escape");
  await p.clock.fastForward(31000);
  check(
    "Unrelated clipboard preserved",
    (await p.evaluate(() => qa.clipboard)) === "unrelated clipboard",
  );
  await p.clock.fastForward(181000);
  await p.getByRole("heading", { name: "De volta ao seu espaço." }).waitFor();
  check("Idle locks vault", (await p.locator(".card-premium").count()) === 0);
  check("No runtime errors", errors.length === 0);
  fs.writeFileSync(
    ".cache/security-retest/browser-results.json",
    JSON.stringify(
      {
        checks,
        errors,
        boundary:
          "Synthetic Tauri bridge; native capture and crypto tested separately.",
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  await b.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
