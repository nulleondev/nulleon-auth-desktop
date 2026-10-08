import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowDown,
  ArrowRight,
  Download,
  Github,
  Instagram,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Fingerprint,
  ScanLine,
  X,
  Menu,
  Pause,
  Play,
  Plus,
  Eye,
  EyeOff,
  WifiOff,
} from "lucide-react";
import "@fontsource-variable/space-grotesk";
import OrbitMark from "../../shared/OrbitMark";
import Atmosphere, { useReducedMotion } from "../../shared/Atmosphere";
import portal from "../../shared/limiar-portal.webp";
import monolith from "../../shared/limiar-core.webp";
import DemoVault from "./ProductPreview";
import PlatformIcon from "./PlatformIcon";
import useCinematicMotion from "./useCinematicMotion";
import "./style.css";
import release from "./releases.json";
const REPO = release.repository;
const chapters = [
  {
    label: "01 / GUARDAR",
    title: "Fora da nuvem.\nDentro do seu controle.",
    body: "O arquivo do cofre fica no seu computador. A criptografia acontece ali. Sem uma cópia invisível criada pelo site.",
    tech: "AES-256-GCM + ARGON2ID",
    icon: LockKeyhole,
  },
  {
    label: "02 / REVELAR",
    title: "Aparece para você.\nSó quando você decide.",
    body: "Códigos e notas começam ocultos. Revele um item quando precisar. Ao trocar de janela, o conteúdo se recolhe.",
    tech: "PRIVACIDADE NA TELA",
    icon: Eye,
  },
  {
    label: "03 / RETORNAR",
    title: "Uma pausa.\nE tudo se fecha.",
    body: "Após três minutos de inatividade, o cofre bloqueia. Sua senha mestra abre o caminho de volta.",
    tech: "BLOQUEIO POR INATIVIDADE",
    icon: ShieldCheck,
  },
];
function PrivacyLab() {
  const [chapter, setChapter] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const item = chapters[chapter];
  const Icon = item.icon;
  return (
    <section className="privacy-lab section-shell" id="privacidade" data-scene>
      <div className="section-topline">
        <span className="eyebrow">02 / A ARQUITETURA DO INVISÍVEL</span>
        <span className="technical-tag">LOCAL FIRST</span>
      </div>
      <div className="privacy-layout">
        <div
          className={`core-stage chapter-${chapter} ${revealed ? "is-revealed" : ""}`}
        >
          <div className="core-orbit core-orbit-one" />
          <div className="core-orbit core-orbit-two" />
          <img
            src={monolith}
            alt="Monólito óptico em vidro escuro, iluminado por um núcleo violeta"
            loading="lazy"
          />
          <span className="core-coordinate">N / PRIVATE MEMORY</span>
          <div className="core-readout">
            <Fingerprint size={25} />
            <span>
              NÚCLEO PRIVADO
              <small>{revealed ? "CAMADA REVELADA" : "CONTEÚDO OCULTO"}</small>
            </span>
            <span className="readout-dot" />
          </div>
          <div className="privacy-code" aria-live="polite">
            {revealed ? "482 096" : "••• •••"}
            <small>EXEMPLO ILUSTRATIVO</small>
          </div>
          <button
            className="reveal-control"
            aria-pressed={revealed}
            onClick={() => setRevealed(!revealed)}
          >
            {revealed ? <EyeOff size={17} /> : <Eye size={17} />}{" "}
            {revealed ? "Ocultar camada" : "Revelar camada"}
            <span>↗</span>
          </button>
        </div>
        <div className="chapter-panel">
          <div
            className="chapter-tabs"
            role="tablist"
            aria-label="Camadas de privacidade"
          >
            {chapters.map((c, i) => (
              <button
                id={`layer-${i}`}
                key={c.label}
                role="tab"
                aria-selected={chapter === i}
                tabIndex={chapter === i ? 0 : -1}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step && event.key !== "Home" && event.key !== "End")
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? chapters.length - 1
                        : (chapter + step + chapters.length) % chapters.length;
                  setChapter(next);
                  document.getElementById(`layer-${next}`)?.focus();
                }}
                aria-controls="chapter-content"
                onClick={() => setChapter(i)}
              >
                <span>0{i + 1}</span>
                {c.label.split(" / ")[1]}
                <i />
              </button>
            ))}
          </div>
          <div
            key={chapter}
            className="chapter-copy"
            role="tabpanel"
            id="chapter-content"
            aria-labelledby={`layer-${chapter}`}
          >
            <span className="chapter-number">0{chapter + 1}</span>
            <h2>
              {item.title.split("\n").map((line, i) => (
                <React.Fragment key={line}>
                  {i > 0 && <br />}
                  {line}
                </React.Fragment>
              ))}
            </h2>
            <p>{item.body}</p>
            <div className="tech-proof">
              <Icon size={18} />
              <span>{item.tech}</span>
            </div>
          </div>
          <div className="chapter-bottom">
            <span>Você define o limite.</span>
            <ArrowUpRight size={24} />
          </div>
        </div>
      </div>
    </section>
  );
}
function App() {
  const root = useRef(null);
  const [menu, setMenu] = useState(false);
  const reduced = useReducedMotion();
  const [manualPaused, setManualPaused] = useState(false);
  const paused = manualPaused || reduced;
  useCinematicMotion(root, paused);
  useEffect(() => {
    const escape = (e) => {
      if (e.key === "Escape") setMenu(false);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  return (
    <div ref={root} className={`site limiar ${paused ? "motion-paused" : ""}`}>
      <a className="skip-link" href="#conteudo">
        Pular para o conteúdo
      </a>
      <div className="scroll-progress" aria-hidden="true" />
      <header className="site-header">
        <a className="wordmark" href="#" aria-label="Nulleon Auth, início">
          <OrbitMark size={33} />
          <span>
            nulleon<span>auth</span>
          </span>
        </a>
        <nav className={menu ? "is-open" : ""} aria-label="Navegação principal">
          <a href="#experiencia" onClick={() => setMenu(false)}>
            Experiência
          </a>
          <a href="#privacidade" onClick={() => setMenu(false)}>
            Privacidade
          </a>
          <a href="#downloads" onClick={() => setMenu(false)}>
            Downloads
          </a>
        </nav>
        <a
          className="header-github"
          href={REPO}
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} />
          <span>GitHub</span>
          <ArrowUpRight size={15} />
        </a>
        <button
          className="menu-toggle"
          aria-label={menu ? "Fechar menu" : "Abrir menu"}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      <main id="conteudo">
        <section className="hero" data-scene>
          <div className="hero-landscape">
            <img
              src={portal}
              alt="Portal de vidro luminoso sobre um oceano de obsidiana e nuvens violetas"
              fetchPriority="high"
            />
            <div className="landscape-shade" />
          </div>
          <Atmosphere paused={paused} density={110} />
          <div className="hero-grain" aria-hidden="true" />
          <div className="hero-top-coordinate">
            <span>PRIVATE BY DESIGN</span>
            <span>N—AUTH / 001</span>
          </div>
          <div className="hero-title">
            <p className="eyebrow">
              <span className="signal-dot" /> SEU ESPAÇO DIGITAL. REIMAGINADO.
            </p>
            <h1>
              <span>Privado.</span>
              <span>Por escolha.</span>
            </h1>
          </div>
          <div className="portal-reticle" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span>ACESSO SOB SEU CONTROLE</span>
          </div>
          <div className="floating-pass pass-left">
            <span className="pass-eyebrow">
              <ShieldCheck size={13} /> COFRE LOCAL
            </span>
            <div>
              <OrbitMark size={24} />
              <span>
                Identidade protegida<small>A chave fica com você.</small>
              </span>
            </div>
            <span className="pass-line" />
          </div>
          <div className="floating-pass pass-right">
            <span className="pass-eyebrow">
              CÓDIGO 2FA <LockKeyhole size={12} />
            </span>
            <strong>••• •••</strong>
            <span className="pass-footer">OCULTO ATÉ VOCÊ REVELAR</span>
          </div>
          <div className="hero-bottom">
            <div className="hero-description">
              <p>
                Sua vida digital é imensa.
                <br />O acesso a ela pode ser só seu.
              </p>
              <span>Códigos 2FA e notas em um cofre local.</span>
            </div>
            <a className="button button-primary" href="#experiencia">
              <span>Entre no seu espaço</span>
              <ArrowUpRight size={19} />
            </a>
            <a className="scroll-cue" href="#experiencia">
              <span>
                EXPLORE
                <br />O LIMIAR
              </span>
              <div>
                <ArrowDown size={17} />
              </div>
            </a>
          </div>
          <button
            className="motion-control"
            aria-label={paused ? "Ativar animações" : "Pausar animações"}
            aria-pressed={paused}
            disabled={reduced}
            title={
              reduced
                ? "Movimento reduzido nas preferências do sistema"
                : undefined
            }
            onClick={() => setManualPaused(!manualPaused)}
          >
            {paused ? <Play size={12} /> : <Pause size={12} />} Motion{" "}
            {paused ? "off" : "on"}
          </button>
        </section>
        <div className="signal-marquee" aria-hidden="true">
          <div>
            {Array.from({ length: 4 }, (_, i) => (
              <React.Fragment key={i}>
                <span>SUAS CHAVES</span>
                <OrbitMark size={32} />
                <span>SEU CONTROLE</span>
                <OrbitMark size={32} />
                <span>SEU ESPAÇO</span>
                <OrbitMark size={32} />
              </React.Fragment>
            ))}
          </div>
        </div>
        <section className="experience-story" id="experiencia" data-scene>
          <div className="experience-sticky">
            <div className="section-topline">
              <span className="eyebrow">01 / ATRAVESSE O LIMIAR</span>
              <span className="technical-tag">NULLEON AUTHENTICATOR</span>
            </div>
            <div className="experience-heading" data-reveal>
              <h2>
                O essencial.
                <br />
                <span>Em outra dimensão.</span>
              </h2>
              <p>
                Uma interface que abre espaço.
                <br />
                Para suas contas. Para sua privacidade.
                <br />
                Para você.
              </p>
            </div>
            <div className="product-theater">
              <div className="theater-halo" />
              <div className="theater-axis axis-a" />
              <div className="theater-axis axis-b" />
              <div className="satellite satellite-a">
                <KeyRound size={18} />
                <span>
                  2FA<small>SEMPRE À MÃO</small>
                </span>
              </div>
              <div className="satellite satellite-b">
                <WifiOff size={18} />
                <span>
                  LOCAL<small>POR ESCOLHA</small>
                </span>
              </div>
              <div className="product-montage">
                <DemoVault />
              </div>
              <span className="theater-index">
                N / 02 — EXPLORE AS CONTAS NA PRÉVIA
              </span>
            </div>
            <p className="demo-footnote">
              Demonstração interativa · dados fictícios · nenhum acesso ao seu
              cofre
            </p>
          </div>
        </section>
        <PrivacyLab />
        <section className="manifesto" data-scene>
          <div className="manifesto-art">
            <img src={portal} alt="" loading="lazy" />
          </div>
          <div className="manifesto-scrim" />
          <Atmosphere paused={paused} density={45} />
          <div className="manifesto-content" data-reveal>
            <span className="eyebrow">
              UM ESPAÇO QUE NÃO PERTENCE A MAIS NINGUÉM.
            </span>
            <h2>
              O mundo lá fora.
              <br />
              Você, aqui dentro.
            </h2>
            <a
              className="round-link"
              href="#downloads"
              aria-label="Ver plataformas disponíveis"
            >
              <ArrowUpRight size={34} />
            </a>
            <span className="manifesto-signature">
              PRIVACIDADE É TER A ESCOLHA.
            </span>
          </div>
        </section>
        <section className="downloads section-shell" id="downloads">
          <div className="section-topline">
            <span className="eyebrow">03 / TRAGA PARA O SEU MUNDO</span>
            <span className="technical-tag">DESKTOP EDITION</span>
          </div>
          <div className="download-heading" data-reveal>
            <h2>
              Um novo espaço.
              <br />
              No seu sistema.
            </h2>
            <p>
              A mesma identidade. O seu ambiente.
              <br />{release.available ? `Versão ${release.version} · pré-lançamento.` : "Instaladores em verificação."}
            </p>
          </div>
          <div className="download-grid">
            {[
              {
                name: "Linux",
                format: "APPIMAGE / X86_64",
                icon: "linux",
                label: "01",
              },
              {
                name: "Windows",
                format: "INSTALADOR / X64",
                icon: "windows",
                label: "02",
              },
              {
                name: "macOS",
                format: "DMG / APPLE SILICON + INTEL",
                icon: "mac",
                label: "03",
              },
            ].map((os) => (
              <article className="download-card" key={os.name} data-reveal>
                <div className="platform-top">
                  <PlatformIcon platform={os.icon} />
                  <span>{os.label}</span>
                </div>
                <h3>{os.name}</h3>
                <span className="micro">{os.format}</span>
                <div className="download-orbit" aria-hidden="true">
                  <OrbitMark size={130} />
                </div>
                <div className="download-bottom">
                  <span className="release-state">
                    <i />
                    {release.available ? `v${release.version} · pré-lançamento` : "Verificando instaladores"}
                  </span>
                  {release.available ? (os.icon === "mac" ? <>
                    <a className="button" href={release.assets.macosArm64}>Apple Silicon <Download size={16} /></a>
                    <a className="text-link" href={release.assets.macosX64}>Baixar para Intel <ArrowUpRight size={15} /></a>
                  </> : <a className="button" href={os.icon === "linux" ? release.assets.linux : release.assets.windows}>Baixar {os.name} <Download size={16} /></a>) : <button className="button download-pending" disabled>Em verificação <Download size={16} /></button>}
                </div>
              </article>
            ))}
          </div>
          <p className="demo-footnote">Pré-lançamento sem certificado de desenvolvedor. Windows e macOS podem solicitar autorização para abrir. macOS sem notarização. <a href={release.available ? release.releaseUrl : REPO} target="_blank" rel="noreferrer">Instruções e verificações SHA-256</a>.</p>
          <div className="repo-panel">
            <div>
              <Github size={28} />
              <div>
                <h3>Acompanhe o que vem a seguir.</h3>
                <p>
                  Código do desktop e site. API administrativa e dados pessoais não fazem parte desta publicação.
                </p>
              </div>
            </div>
            <a
              className="text-link"
              href={REPO}
              target="_blank"
              rel="noreferrer"
            >
              Explorar no GitHub <ArrowUpRight size={19} />
            </a>
          </div>
        </section>
        <section className="faq section-shell">
          <div>
            <span className="eyebrow">ANTES DE ATRAVESSAR</span>
            <h2>Sem mistério.</h2>
          </div>
          <div>
            {[
              {
                q: "Meus códigos precisam de internet?",
                a: "O aplicativo gera os códigos TOTP localmente a partir das chaves guardadas no cofre e do relógio do computador. Mantenha a hora do sistema correta.",
              },
              {
                q: "O que acontece se eu perder o arquivo do cofre?",
                a: "O cofre é local. Mantenha uma cópia de segurança do arquivo vault.nauth em um lugar protegido. O site não guarda uma cópia e não recupera seus dados.",
              },
              {
                q: "Já posso baixar para o meu sistema?",
                a: release.available ? "Sim. Escolha o instalador do seu sistema acima. Para macOS, escolha Apple Silicon ou Intel. Esta é uma versão de pré-lançamento sem certificado de desenvolvedor; consulte as instruções da release e verifique o SHA-256." : "Os instaladores estão em verificação. Os links serão ativados quando os arquivos estiverem publicados e acessíveis.",
              },
            ].map((item, i) => (
              <details key={item.q}>
                <summary>
                  <span className="question-number">0{i + 1}</span>
                  {item.q}
                  <Plus size={18} />
                </summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <a className="wordmark" href="#">
            <OrbitMark />
            <span>
              nulleon<span>auth</span>
            </span>
          </a>
          <span>PRIVADO. POR ESCOLHA.</span>
          <a href="#" className="text-link">
            Voltar ao topo <ArrowUpRight size={17} />
          </a>
        </div>
        <div className="footer-word" aria-hidden="true">
          nulleon<span>↗</span>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Nulleon</span>
          <span>BUILT FOR YOUR PRIVATE WORLD.</span>
          <nav className="footer-socials" aria-label="Redes sociais">
            <a
              href="https://www.instagram.com/dev.nulleon/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram de @dev.nulleon (abre em nova aba)"
            >
              <Instagram size={15} aria-hidden="true" />
              @dev.nulleon <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub ↗
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
