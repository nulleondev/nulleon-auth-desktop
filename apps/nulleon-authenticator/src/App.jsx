import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import {
  AlertCircle,
  Fingerprint,
  ImagePlus,
  Pause,
  Play,
  ArrowRight,
  ChevronRight,
  Search,
  WifiOff,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader,
  Lock,
  Maximize2,
  Minimize2,
  Plus,
  Scan,
  ShieldCheck,
  StickyNote,
  Trash2,
  X,
} from "lucide-react";
import "@fontsource-variable/space-grotesk";

import OrbitMark from "../../shared/OrbitMark";
import portalArt from "../../shared/limiar-portal.webp";
import coreArt from "../../shared/limiar-core.webp";
import Atmosphere, { useReducedMotion } from "../../shared/Atmosphere";
import "./App.css";
import VaultSetup from "./VaultSetup";
import VaultRecovery from "./VaultRecovery";
import { migrateVaultIfNeeded, V2_SCHEMA_VERSION } from "./utils/migration";
import { generateTOTP } from "./utils/totp";
import { normalizeSecret, validateSecret } from "./utils/validation";
import { qrErrorMessage } from "./utils/qr";

const EMPTY_ITEM = {
  type: "totp",
  name: "",
  secret: "",
  issuer: "",
  digits: 6,
  period: 30,
  algo: "SHA-1",
  content: "",
};

function App() {
  const reducedMotion = useReducedMotion();
  const [motionPaused, setMotionPaused] = useState(false);
  const noMotion = reducedMotion || motionPaused;
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [unlocking, setUnlocking] = useState(false);
  const [screen, setScreen] = useState("loading");
  const [vault, setVault] = useState(null);
  const [currentPassword, setCurrentPassword] = useState(null);
  const [vaultFileJson, setVaultFileJson] = useState(null);
  const [vaultPath, setVaultPath] = useState(null);
  const [hasVault, setHasVault] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Iniciando proteção local…");
  const [inputPassword, setInputPassword] = useState("");
  const [timeLeft, setTimeLeft] = useState(30);
  const [toast, setToast] = useState({ show: false, msg: "", type: "info" });
  const [modalType, setModalType] = useState(null);
  const [viewAccount, setViewAccount] = useState(null);
  const [showPass, setShowPass] = useState(false);
  const [accData, setAccData] = useState(EMPTY_ITEM);
  const [currentToken, setCurrentToken] = useState("------");
  const [scanningScreen, setScanningScreen] = useState(false);
  const [appFocused, setAppFocused] = useState(true);
  const [privacyMode, setPrivacyMode] = useState(true);
  const [isMaximized, setIsMaximized] = useState(false);

  const screenRef = useRef(screen);
  const idleTimeout = useRef(null);
  const toastTimeout = useRef(null);
  const clipboardTimeout = useRef(null);
  const lastCopiedValue = useRef(null);
  const scanGeneration = useRef(0);
  const scanPending = useRef(false);
  const sessionEpoch = useRef(0);
  const savePending = useRef(false);
  const [saving, setSaving] = useState(false);
  const qrFileInput = useRef(null);
  const tauriWindow = useRef(null);

  useEffect(() => {
    if (!window.__TAURI_INTERNALS__) return undefined;

    let unlistenResize;
    const setupWindowControls = async () => {
      const appWindow = getCurrentWindow();
      tauriWindow.current = appWindow;
      try {
        setIsMaximized(await appWindow.isMaximized());
        unlistenResize = await appWindow.onResized(async () => {
          setIsMaximized(await appWindow.isMaximized());
        });
      } catch {
        // Window controls stay available when the host does not expose state.
      }
    };
    void setupWindowControls();
    return () => {
      unlistenResize?.();
      tauriWindow.current = null;
    };
  }, []);

  const runWindowCommand = (command) => {
    const appWindow = tauriWindow.current;
    if (!appWindow) return;
    void command(appWindow).catch(() => {
      showToast("O controle da janela não está disponível", "error");
    });
  };

  const minimizeWindow = () => runWindowCommand((appWindow) => appWindow.minimize());
  const toggleMaximizeWindow = () =>
    runWindowCommand(async (appWindow) => {
      await appWindow.toggleMaximize();
      setIsMaximized(await appWindow.isMaximized());
    });
  const closeWindow = () => runWindowCommand((appWindow) => appWindow.close());

  useEffect(() => {
    // Closing/cancelling a form invalidates asynchronous QR results and clears drafts.
    scanGeneration.current += 1;
    if (!modalType) {
      setAccData(EMPTY_ITEM);
      setShowPass(false);
    }
  }, [modalType]);

  useEffect(() => {
    screenRef.current = screen;
  }, [screen]);

  const showToast = (msg, type = "info") => {
    if (toastTimeout.current) clearTimeout(toastTimeout.current);
    setToast({ show: true, msg, type });
    toastTimeout.current = setTimeout(
      () => setToast({ show: false, msg: "", type }),
      3200,
    );
  };

  const clearOwnedClipboard = async () => {
    const owned = lastCopiedValue.current;
    if (!owned) return;
    try {
      const current = await readText();
      if (lastCopiedValue.current === owned && current === owned) {
        await writeText("");
      }
    } catch {
      // Another application may replace the text selection with non-text content.
    } finally {
      if (lastCopiedValue.current === owned) lastCopiedValue.current = null;
    }
  };

  const copySensitive = async (value, label) => {
    if (!value) return showToast("Não há conteúdo para copiar", "error");
    try {
      await writeText(value);
      lastCopiedValue.current = value;
      if (clipboardTimeout.current) clearTimeout(clipboardTimeout.current);
      clipboardTimeout.current = setTimeout(clearOwnedClipboard, 30_000);
      showToast(`${label} copiado. Limpeza automática em 30 s.`);
    } catch {
      showToast("Não foi possível acessar a área de transferência", "error");
    }
  };

  const lockVault = (reason = "manual") => {
    if (screenRef.current !== "vault") return;
    sessionEpoch.current += 1;
    scanGeneration.current += 1;
    setAccData(EMPTY_ITEM);
    setShowPass(false);
    setVault(null);
    setSearch("");
    setFilter("all");
    setCurrentPassword(null);
    setInputPassword("");
    setViewAccount(null);
    setModalType(null);
    setPrivacyMode(true);
    setScreen("unlock");
    void clearOwnedClipboard();
    if (reason === "idle")
      showToast("Cofre bloqueado após 3 minutos de inatividade");
  };

  const resetIdleTimer = () => {
    if (idleTimeout.current) clearTimeout(idleTimeout.current);
    idleTimeout.current = setTimeout(() => lockVault("idle"), 3 * 60 * 1000);
  };

  useEffect(() => {
    const handleFocus = () => setAppFocused(true);
    const handleBlur = () => {
      setAppFocused(false);
      setShowPass(false);
      setPrivacyMode(true);
    };
    const handleActivity = () => resetIdleTimer();
    const handleKeyDown = (event) => {
      resetIdleTimer();
      if (event.key === "Escape") {
        setViewAccount(null);
        setModalType(null);
        setPrivacyMode(true);
      }
    };

    void init();
    window.addEventListener("focus", handleFocus);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("pointerdown", handleActivity);
    window.addEventListener("pointermove", handleActivity);
    window.addEventListener("keydown", handleKeyDown);
    resetIdleTimer();

    return () => {
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("pointerdown", handleActivity);
      window.removeEventListener("pointermove", handleActivity);
      window.removeEventListener("keydown", handleKeyDown);
      if (idleTimeout.current) clearTimeout(idleTimeout.current);
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      if (clipboardTimeout.current) clearTimeout(clipboardTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (!viewAccount || viewAccount.type !== "totp") {
      setCurrentToken("------");
      return undefined;
    }

    const period = Number(viewAccount.period) || 30;
    const updateToken = () => {
      const epoch = Math.floor(Date.now() / 1000);
      setTimeLeft(period - (epoch % period));
      setCurrentToken(generateTOTP(viewAccount.secret, viewAccount));
    };

    updateToken();
    const interval = setInterval(updateToken, 1000);
    return () => clearInterval(interval);
  }, [viewAccount]);

  useEffect(() => {
    if (!viewAccount && !modalType) return;
    const previous = document.activeElement;
    const dialog = document.querySelector('[role="dialog"]');
    const focusables = () => [
      ...dialog.querySelectorAll(
        'button:not(:disabled), input:not([hidden]), textarea, [tabindex="0"]',
      ),
    ];
    focusables()[0]?.focus();
    const trap = (event) => {
      if (event.key !== "Tab") return;
      const elements = focusables();
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    dialog?.addEventListener("keydown", trap);
    return () => {
      dialog?.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [viewAccount, modalType]);

  const filteredItems = (vault || []).filter(
    (item) =>
      (filter === "all" || item.type === filter) &&
      `${item.name || item.title || ""} ${item.issuer || ""}`
        .toLocaleLowerCase("pt-BR")
        .includes(search.toLocaleLowerCase("pt-BR")),
  );

  async function init() {
    setLoadingMsg("Localizando seu cofre criptografado…");
    try {
      const result = await invoke("find_and_read_vault");
      if (result?.content) {
        setVaultFileJson(result.content);
        setVaultPath(result.path ?? null);
        setHasVault(true);
      }
    } catch {
      setHasVault(false);
    } finally {
      setScreen("home");
    }
  }

  const unlockPending = useRef(false);
  async function handleUnlock() {
    if (unlockPending.current) return;
    if (!inputPassword) {
      return showToast("Insira sua senha mestra", "error");
    }

    unlockPending.current = true;
    const epoch = sessionEpoch.current;
    setUnlocking(true);
    setLoadingMsg("Descriptografando localmente…");
    try {
      const plaintext = await invoke("unlock_vault", {
        password: inputPassword,
        vaultFileJson,
      });
      if (epoch !== sessionEpoch.current) return;
      const migrated = migrateVaultIfNeeded(JSON.parse(plaintext));
      setVault(migrated.items);
      setCurrentPassword(inputPassword);
      setInputPassword("");
      if (toastTimeout.current) clearTimeout(toastTimeout.current);
      setToast({ show: false, msg: "", type: "info" });
      setScreen("vault");
      setPrivacyMode(true);
      resetIdleTimer();
    } catch {
      setInputPassword("");
      showToast("Acesso negado. Verifique a senha mestra.", "error");
    } finally {
      unlockPending.current = false;
      setUnlocking(false);
    }
  }

  async function saveVault(newData) {
    if (!currentPassword || !vaultFileJson) {
      showToast("O cofre precisa ser desbloqueado novamente", "error");
      return false;
    }

    if (savePending.current) return false;
    savePending.current = true;
    setSaving(true);
    const epoch = sessionEpoch.current;
    try {
      const v2Data = { vaultVersion: V2_SCHEMA_VERSION, items: newData };
      const newFileJson = await invoke("save_existing_vault", {
        password: currentPassword,
        data: JSON.stringify(v2Data),
        oldVaultJson: vaultFileJson,
      });

      await invoke("write_vault_file", {
        path: vaultPath,
        content: newFileJson,
      });

      setVaultFileJson(newFileJson);
      if (epoch !== sessionEpoch.current) return false;
      setVault(newData);
      return true;
    } catch {
      showToast(
        "Não foi possível salvar com segurança. O arquivo anterior foi mantido.",
        "error",
      );
      return false;
    } finally {
      savePending.current = false;
      setSaving(false);
    }
  }

  const addAccount = async () => {
    const name = accData.name.trim();
    const normalized = normalizeSecret(accData.secret);

    if (!name) return showToast("Informe um título para o item", "error");
    if (accData.type === "totp") {
      const validation = validateSecret(normalized);
      if (!validation.valid) return showToast(validation.error, "error");
    }
    if (accData.type === "note" && !accData.content.trim()) {
      return showToast("A nota não pode ficar vazia", "error");
    }

    const newItem = {
      ...accData,
      id: window.crypto.randomUUID(),
      name,
      secret: accData.type === "totp" ? normalized : "",
      issuer: accData.issuer.trim(),
      createdAt: new Date().toISOString(),
    };

    if (await saveVault([...(vault || []), newItem])) {
      setModalType(null);
      setAccData(EMPTY_ITEM);
      setShowPass(false);
      showToast("Item protegido no cofre");
    }
  };

  const removeAccount = async (accountId) => {
    if (
      !window.confirm(
        "Remover este item do cofre? O backup anterior será preservado.",
      )
    )
      return;
    if (await saveVault(vault.filter((item) => item.id !== accountId))) {
      setViewAccount(null);
      showToast("Item removido");
    }
  };

  const handleReadQR = async (file = null) => {
    if (scanPending.current) return;
    scanPending.current = true;
    setScanningScreen(true);
    const generation = scanGeneration.current;
    const epoch = sessionEpoch.current;
    try {
      if (file && (file.size === 0 || file.size > 10 * 1024 * 1024))
        throw "QR_IMAGE_INVALID";
      const result = file
        ? await invoke("scan_qr_from_image", {
            imageData: Array.from(new Uint8Array(await file.arrayBuffer())),
          })
        : await invoke("scan_qr_from_screen");
      if (
        generation !== scanGeneration.current ||
        epoch !== sessionEpoch.current
      )
        return;
      setAccData((current) => ({
        ...current,
        type: "totp",
        name: result.account || current.name,
        issuer: result.issuer || "",
        secret: result.secret,
        digits: result.digits,
        algo: result.algorithm,
        period: result.period,
      }));
      setShowPass(false);
      showToast("QR lido. Confira os dados antes de salvar.");
    } catch (error) {
      if (
        generation === scanGeneration.current &&
        epoch === sessionEpoch.current
      )
        showToast(qrErrorMessage(error), "error");
    } finally {
      scanPending.current = false;
      setScanningScreen(false);
      if (qrFileInput.current) qrFileInput.current.value = "";
    }
  };

  const formattedToken = (() => {
    const midpoint = Math.ceil(currentToken.length / 2);
    return `${currentToken.slice(0, midpoint)} ${currentToken.slice(midpoint)}`;
  })();

  if (screen === "loading") {
    return (
      <div className="app-root">
        <div className="center-content" role="status" aria-live="polite">
          <Loader className="loader" size={42} color="var(--accent)" />
          <p className="welcome-subtitle">{loadingMsg}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="mesh-bg" aria-hidden="true">
        <div className="mesh-sphere sphere-1" />
        <div className="mesh-sphere sphere-2" />
        <div className="mesh-sphere sphere-3" />
      </div>
      <div className="noise" aria-hidden="true" />

      <section
        className={`container screen-${screen} ${noMotion ? "motion-paused" : ""}`}
        onPointerMove={(event) => {
          if (noMotion || event.pointerType !== "mouse" || screen === "vault")
            return;
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.style.setProperty(
            "--scene-x",
            ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3),
          );
          event.currentTarget.style.setProperty(
            "--scene-y",
            ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3),
          );
        }}
        onPointerLeave={(event) => {
          event.currentTarget.style.setProperty("--scene-x", 0);
          event.currentTarget.style.setProperty("--scene-y", 0);
        }}
        aria-label="Nulleon Authenticator"
      >
        {screen !== "vault" && (
          <div className="auth-world" aria-hidden="true">
            <img src={portalArt} alt="" />
            <div className="auth-world-shade" />
            <Atmosphere paused={noMotion} density={55} />
          </div>
        )}
        <header className="header-bar">
          <span
            className="titlebar-drag"
            data-tauri-drag-region
            onDoubleClick={toggleMaximizeWindow}
            aria-hidden="true"
          />
          <div className="brand">
            <div className="brand-mark">
              <OrbitMark size={31} />
            </div>
            <div className="brand-copy">
              <h1>
                nulleon <span className="brand-auth">auth</span>
              </h1>
              <span>SEU ESPAÇO PRIVADO</span>
            </div>
          </div>
          <span className="header-local">
            <WifiOff size={13} /> Local por escolha
          </span>
          <button
            className="app-motion"
            type="button"
            aria-label={noMotion ? "Ativar animações" : "Pausar animações"}
            aria-pressed={noMotion}
            disabled={reducedMotion}
            onClick={() => setMotionPaused((value) => !value)}
          >
            {noMotion ? <Play size={13} /> : <Pause size={13} />}
          </button>
          {screen === "vault" && (
            <button
              className="icon-button"
              type="button"
              onClick={() => lockVault("manual")}
              aria-label="Bloquear cofre"
            >
              <Lock size={18} aria-hidden="true" />
            </button>
          )}
          <div className="window-controls" aria-label="Controles da janela">
            <button
              className="window-control"
              type="button"
              onClick={minimizeWindow}
              aria-label="Minimizar janela"
              title="Minimizar"
            >
              <Minimize2 size={14} aria-hidden="true" />
            </button>
            <button
              className="window-control"
              type="button"
              onClick={toggleMaximizeWindow}
              aria-label={isMaximized ? "Restaurar janela" : "Maximizar janela"}
              title={isMaximized ? "Restaurar" : "Maximizar"}
            >
              <Maximize2 size={14} aria-hidden="true" />
            </button>
            <button
              className="window-control window-control-close"
              type="button"
              onClick={closeWindow}
              aria-label="Fechar janela"
              title="Fechar"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div
          className="app-body"
          inert={
            viewAccount || modalType || (!appFocused && screen === "vault")
              ? true
              : undefined
          }
        >
          {screen !== "vault" && (
            <aside className="welcome-art" aria-label="Identidade Nulleon Auth">
              <span className="art-index">N / 001 — ENTRE NO SEU MUNDO</span>
              <div className="auth-reticle" aria-hidden="true">
                <i />
                <i />
                <OrbitMark size={32} />
              </div>
              <div className="art-copy">
                <h2>
                  Privado. <br />
                  Por escolha.
                </h2>
                <p>
                  Existe um mundo inteiro lá fora. <br />
                  Este espaço pertence a você.
                </p>
              </div>
              <span className="art-footer">
                <OrbitMark size={18} /> SUA IDENTIDADE. SUA ÓRBITA.
              </span>
            </aside>
          )}
          {screen === "vault" && (
            <aside className="vault-sidebar">
              <p className="sidebar-label">BIBLIOTECA</p>
              {[
                { id: "all", label: "Todos os itens", icon: ShieldCheck },
                { id: "totp", label: "Códigos 2FA", icon: KeyRound },
                { id: "note", label: "Notas privadas", icon: StickyNote },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  className={`vault-nav ${filter === id ? "active" : ""}`}
                  aria-pressed={filter === id}
                  onClick={() => setFilter(id)}
                >
                  <Icon size={17} />
                  <span>{label}</span>
                  <small>
                    {
                      (vault || []).filter(
                        (item) => id === "all" || item.type === id,
                      ).length
                    }
                  </small>
                </button>
              ))}
              <div className="sidebar-sculpture" aria-hidden="true">
                <img src={coreArt} alt="" />
                <span>N / PRIVATE MEMORY</span>
              </div>
              <div className="sidebar-bottom">
                <Lock size={17} />
                <span>
                  Seu arquivo. Seu controle.
                  <small>Bloqueio automático em 3 min.</small>
                </span>
              </div>
            </aside>
          )}
          <main className="content-area">
            {screen === "home" && (
              <div className="center-content onboarding-panel" key={screen}>
                <div className="welcome-symbol">
                  <Fingerprint size={31} />
                  <span className="welcome-signal" />
                </div>
                <p className="welcome-kicker">BEM-VINDO AO SEU ESPAÇO</p>
                <h2 className="welcome-title">
                  Tudo começa
                  <br />
                  com você.
                </h2>
                <p className="welcome-subtitle">
                  Seus códigos e notas, guardados no seu computador. Abra seu
                  cofre para continuar.
                </p>
                <div className="security-status">
                  <ShieldCheck
                    size={24}
                    color="var(--accent)"
                    aria-hidden="true"
                  />
                  <div>
                    <strong>
                      {hasVault
                        ? "Cofre criptografado encontrado"
                        : "Nenhum cofre encontrado"}
                    </strong>
                    <span>
                      {hasVault
                        ? "O conteúdo permanece fechado até a senha mestra."
                        : "Crie um novo cofre ou importe seu arquivo criptografado."}
                    </span>
                  </div>
                </div>
                <div className="home-actions">
                  <button
                    className="btn-primary"
                    type="button"
                    onClick={() => setScreen(hasVault ? "unlock" : "setup")}
                  >
                    {hasVault ? "Acessar meu cofre" : "Começar meu cofre"}{" "}
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </div>
                <p className="welcome-footnote">
                  <Lock size={12} /> A senha fica neste dispositivo.
                </p>
              </div>
            )}

            {screen === "setup" && <VaultSetup onDone={() => { void init(); }} onCancel={() => setScreen("home")} />}

            {screen === "recovery" && <VaultRecovery vaultFileJson={vaultFileJson} vaultPath={vaultPath} onDone={content => { setVaultFileJson(content); setScreen("unlock"); showToast("Senha atualizada. Desbloqueie com a nova senha."); }} onCancel={() => setScreen("unlock")} />}
            {screen === "unlock" && (
              <div className="center-content onboarding-panel" key={screen}>
                <div
                  className="card-icon"
                  style={{ width: 68, height: 68, marginBottom: 24 }}
                >
                  <KeyRound size={30} aria-hidden="true" />
                </div>
                <p className="eyebrow">Verificação local</p>
                <h2 className="unlock-title">
                  De volta ao
                  <br />
                  seu espaço.
                </h2>
                <p className="welcome-subtitle">
                  A senha nunca sai deste dispositivo.
                </p>
                <div
                  className="password-field"
                  style={{ maxWidth: 430, marginTop: 26 }}
                >
                  <input
                    type={showPass ? "text" : "password"}
                    className="input-premium"
                    placeholder="Senha mestra"
                    value={inputPassword}
                    onChange={(event) => setInputPassword(event.target.value)}
                    onKeyDown={(event) =>
                      event.key === "Enter" && void handleUnlock()
                    }
                    autoComplete="current-password"
                    spellCheck="false"
                    aria-label="Senha mestra"
                    autoFocus
                  />
                  <button
                    className="privacy-toggle"
                    type="button"
                    onClick={() => setShowPass((value) => !value)}
                    aria-label={showPass ? "Ocultar senha" : "Mostrar senha"}
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div className="home-actions" style={{ marginTop: 14 }}>
                  <button
                    className="btn-primary"
                    type="button"
                    disabled={unlocking || !inputPassword}
                    onClick={() => void handleUnlock()}
                  >
                    {unlocking ? (
                      <>
                        <Loader size={18} className="loader" /> Abrindo seu
                        cofre…
                      </>
                    ) : (
                      <>
                        Desbloquear <ArrowRight size={18} />
                      </>
                    )}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => {
                      sessionEpoch.current += 1;
                      setInputPassword("");
                      setScreen("home");
                    }}
                  >
                    Voltar
                  </button>
                  <button className="btn-secondary" type="button" disabled={unlocking} onClick={() => { sessionEpoch.current += 1; setInputPassword(""); setScreen("recovery"); }}>Recuperar com 12 palavras</button>
                </div>
              </div>
            )}

            {screen === "vault" && (
              <>
                <div className="vault-ambient">
                  <div>
                    <span className="eyebrow">DO LADO DE DENTRO</span>
                    <h3>Seu espaço está aberto.</h3>
                    <p>Suas chaves. Suas escolhas.</p>
                  </div>
                  <div className="vault-emblem" aria-hidden="true">
                    <OrbitMark size={64} />
                  </div>
                </div>
                <div className="vault-heading">
                  <div>
                    <p className="eyebrow">SUA IDENTIDADE, ORGANIZADA</p>
                    <h2>
                      Meu cofre{" "}
                      <span>
                        {(vault || []).length.toString().padStart(2, "0")}
                      </span>
                    </h2>
                  </div>
                  <button
                    className="btn-primary add-item"
                    onClick={() => setModalType("add")}
                  >
                    <Plus size={17} />
                    <span>Adicionar item</span>
                  </button>
                </div>
                <label className="vault-search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar no cofre"
                    placeholder="Buscar por nome ou emissor…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch("")}
                      aria-label="Limpar busca"
                    >
                      <X size={15} />
                    </button>
                  )}
                </label>
                {(vault || []).length === 0 ? (
                  <div className="empty-state">
                    <div>
                      <ShieldCheck
                        size={42}
                        color="var(--accent)"
                        aria-hidden="true"
                      />
                      <p>Seu cofre está vazio. Adicione o primeiro item 2FA.</p>
                    </div>
                  </div>
                ) : (
                  <div className="account-grid">
                    {filteredItems.map((account, index) => (
                      <button
                        key={account.id}
                        className="card-premium"
                        style={{ "--item-index": Math.min(index, 8) }}
                        type="button"
                        onClick={() => {
                          setViewAccount(account);
                          setPrivacyMode(true);
                        }}
                      >
                        <div className="card-icon">
                          {account.type === "totp" ? (
                            <ShieldCheck size={22} />
                          ) : (
                            <StickyNote size={22} />
                          )}
                        </div>
                        <div className="card-info">
                          <h4>
                            {account.title || account.name || "Item sem título"}
                          </h4>
                          <p>
                            {account.issuer ||
                              (account.type === "totp"
                                ? "Autenticação 2FA"
                                : "Nota privada")}
                          </p>
                        </div>
                        <span className="card-protection">
                          {account.type === "totp" ? "••• •••" : "PRIVADO"}
                        </span>
                        <ChevronRight className="card-chevron" size={16} />
                      </button>
                    ))}
                    {filteredItems.length === 0 && (
                      <div className="search-empty">
                        <Search size={28} />
                        <h3>Nenhum item encontrado</h3>
                        <p>Tente outro nome ou mude o filtro.</p>
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            setSearch("");
                            setFilter("all");
                          }}
                        >
                          Limpar filtros
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </main>
        </div>
        <footer className="app-footer">
          <span>
            <ShieldCheck size={12} /> Cofre criptografado localmente
          </span>
          <span>NULLEON AUTH</span>
        </footer>

        {viewAccount && (
          <div
            className="modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget && setViewAccount(null)
            }
          >
            <section
              className="modal-content"
              role="dialog"
              aria-modal="true"
              aria-labelledby="detail-title"
            >
              <div className="dialog-header">
                <div>
                  <p className="eyebrow">
                    {viewAccount.issuer ||
                      (viewAccount.type === "totp"
                        ? "Autenticação"
                        : "Nota privada")}
                  </p>
                  <h2 id="detail-title">
                    {viewAccount.name || viewAccount.title}
                  </h2>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setViewAccount(null)}
                  aria-label="Fechar detalhes"
                >
                  <X size={19} />
                </button>
              </div>

              {viewAccount.type === "totp" && (
                <div className="totp-panel">
                  <div className="token-orbit" aria-hidden="true">
                    <i />
                    <i />
                  </div>
                  <div
                    className={`totp-display ${privacyMode ? "blurred-text" : ""}`}
                    aria-label={
                      privacyMode ? "Código oculto" : `Código ${currentToken}`
                    }
                  >
                    {privacyMode ? "••• •••" : formattedToken}
                  </div>
                  <button
                    className="privacy-toggle"
                    type="button"
                    onClick={() => setPrivacyMode((value) => !value)}
                    aria-label={
                      privacyMode ? "Revelar código" : "Ocultar código"
                    }
                  >
                    {privacyMode ? (
                      <Eye size={18} />
                    ) : (
                      <EyeOff size={18} color="var(--accent)" />
                    )}
                  </button>
                  <div className="progress-container">
                    <div className="progress-bar-bg" aria-hidden="true">
                      <div
                        className={`progress-bar-fill ${timeLeft <= 5 ? "urgent" : ""}`}
                        style={{
                          width: `${(timeLeft / (Number(viewAccount.period) || 30)) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="timer-text">{timeLeft}s</span>
                  </div>
                </div>
              )}

              {viewAccount.type === "note" && (
                <div style={{ position: "relative" }}>
                  <div
                    className={`note-content ${privacyMode ? "blurred-text" : ""}`}
                  >
                    {privacyMode
                      ? "Conteúdo protegido. Revele somente quando necessário."
                      : viewAccount.content || "Sem conteúdo."}
                  </div>
                  <button
                    className="privacy-toggle"
                    type="button"
                    style={{ top: 10, right: 10 }}
                    onClick={() => setPrivacyMode((value) => !value)}
                    aria-label={privacyMode ? "Revelar nota" : "Ocultar nota"}
                  >
                    {privacyMode ? (
                      <Eye size={18} />
                    ) : (
                      <EyeOff size={18} color="var(--accent)" />
                    )}
                  </button>
                </div>
              )}

              <div className="action-row">
                <button
                  className="btn-primary"
                  type="button"
                  onClick={() =>
                    void copySensitive(
                      viewAccount.type === "totp"
                        ? currentToken
                        : viewAccount.content,
                      viewAccount.type === "totp" ? "Código" : "Conteúdo",
                    )
                  }
                >
                  <Copy size={18} /> Copiar
                </button>
                <button
                  className="btn-secondary danger-button"
                  type="button"
                  onClick={() => void removeAccount(viewAccount.id)}
                  disabled={saving}
                  aria-label="Remover item"
                >
                  <Trash2 size={19} />
                </button>
              </div>
            </section>
          </div>
        )}

        {modalType === "add" && (
          <div
            className="modal-overlay"
            onMouseDown={(event) =>
              event.target === event.currentTarget && setModalType(null)
            }
          >
            <section
              className="modal-content"
              role="dialog"
              aria-modal="true"
              aria-labelledby="add-title"
            >
              <div className="dialog-header">
                <div>
                  <p className="eyebrow">Novo item protegido</p>
                  <h3 id="add-title">Adicionar ao cofre</h3>
                </div>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => setModalType(null)}
                  aria-label="Cancelar"
                >
                  <X size={19} />
                </button>
              </div>

              <div className="segmented-control" style={{ marginBottom: 16 }}>
                <button
                  className={`segment ${accData.type === "totp" ? "active" : ""}`}
                  type="button"
                  disabled={scanningScreen || saving}
                  onClick={() => setAccData({ ...EMPTY_ITEM, type: "totp" })}
                >
                  2FA
                </button>
                <button
                  className={`segment ${accData.type === "note" ? "active" : ""}`}
                  type="button"
                  disabled={scanningScreen || saving}
                  onClick={() => setAccData({ ...EMPTY_ITEM, type: "note" })}
                >
                  Nota
                </button>
              </div>

              <input
                className="input-premium"
                aria-label="Título"
                placeholder="Título"
                maxLength={120}
                value={accData.name}
                onChange={(event) =>
                  setAccData({ ...accData, name: event.target.value })
                }
                style={{ marginBottom: 12 }}
                autoFocus
              />

              {accData.type === "totp" && (
                <>
                  <input
                    className="input-premium"
                    aria-label="Emissor"
                    placeholder="Emissor (opcional)"
                    maxLength={120}
                    value={accData.issuer}
                    onChange={(event) =>
                      setAccData({ ...accData, issuer: event.target.value })
                    }
                    style={{ marginBottom: 12 }}
                  />
                  <div className="password-field" style={{ marginBottom: 12 }}>
                    <input
                      className="input-premium"
                      type={showPass ? "text" : "password"}
                      aria-label="Chave secreta 2FA"
                      placeholder="Chave secreta Base32"
                      autoComplete="off"
                      spellCheck="false"
                      value={accData.secret}
                      onChange={(event) =>
                        setAccData({ ...accData, secret: event.target.value })
                      }
                    />
                    <button
                      className="privacy-toggle"
                      type="button"
                      onClick={() => setShowPass((value) => !value)}
                      aria-label={showPass ? "Ocultar chave" : "Mostrar chave"}
                    >
                      {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => void handleReadQR()}
                    disabled={scanningScreen}
                    style={{ width: "100%", marginBottom: 16 }}
                  >
                    {scanningScreen ? (
                      <Loader size={18} className="loader" />
                    ) : (
                      <Scan size={18} />
                    )}
                    {scanningScreen ? "Lendo em memória…" : "Ler QR da tela"}
                  </button>
                  <input
                    ref={qrFileInput}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    aria-label="Imagem do QR"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handleReadQR(file);
                    }}
                  />
                  <button
                    className="btn-secondary"
                    type="button"
                    disabled={scanningScreen}
                    style={{ width: "100%", marginBottom: 12 }}
                    onClick={() => qrFileInput.current?.click()}
                  >
                    <ImagePlus size={18} /> Importar imagem do QR
                  </button>
                  <p
                    className="welcome-subtitle"
                    style={{ fontSize: 11, marginBottom: 16 }}
                  >
                    {accData.algo} · {accData.digits} dígitos · {accData.period}{" "}
                    s. Confira estes parâmetros após a leitura. A imagem é
                    processada localmente, sem cópia criada pelo app.
                  </p>
                </>
              )}

              {accData.type === "note" && (
                <textarea
                  className="input-premium"
                  aria-label="Conteúdo da nota"
                  placeholder="Conteúdo da nota privada"
                  maxLength={20_000}
                  value={accData.content}
                  onChange={(event) =>
                    setAccData({ ...accData, content: event.target.value })
                  }
                  style={{
                    minHeight: 130,
                    marginBottom: 16,
                    resize: "vertical",
                  }}
                />
              )}

              <button
                className="btn-primary"
                type="button"
                style={{ width: "100%" }}
                disabled={scanningScreen || saving}
                onClick={() => void addAccount()}
              >
                <ShieldCheck size={18} /> Salvar com criptografia
              </button>
            </section>
          </div>
        )}

        {toast.show && (
          <div className="toast" role="status" aria-live="polite">
            {toast.type === "error" ? (
              <AlertCircle color="var(--danger)" size={18} />
            ) : (
              <ShieldCheck color="var(--accent)" size={18} />
            )}
            <span>{toast.msg}</span>
          </div>
        )}

        {!appFocused && screen === "vault" && (
          <div className="app-blur-overlay" aria-live="polite">
            <ShieldCheck size={48} color="var(--accent)" />
            <h2>Conteúdo protegido</h2>
            <p>Volte ao aplicativo para visualizar o cofre.</p>
          </div>
        )}
      </section>
    </div>
  );
}

export default App;
