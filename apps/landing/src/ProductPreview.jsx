import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  StickyNote,
  WifiOff,
} from "lucide-react";
import OrbitMark from "../../shared/OrbitMark";
const demoItems = [
  { name: "GitHub", label: "Desenvolvimento", code: "482 096", letter: "G" },
  { name: "Google", label: "Conta pessoal", code: "715 283", letter: "G" },
  { name: "Discord", label: "Comunidade", code: "039 641", letter: "D" },
];
export default function DemoVault() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="demo-window">
      <div className="demo-titlebar">
        <span className="window-dots">
          <i />
          <i />
          <i />
        </span>
        <span>nulleon auth</span>
        <span className="demo-label">DEMONSTRAÇÃO</span>
      </div>
      <div className="demo-body">
        <aside className="demo-sidebar">
          <OrbitMark size={26} />
          <span className="demo-nav active">
            <ShieldCheck size={17} /> Meu cofre
          </span>
          <span className="demo-nav">
            <KeyRound size={17} /> Códigos 2FA
          </span>
          <span className="demo-nav">
            <StickyNote size={17} /> Notas privadas
          </span>
          <div className="demo-offline">
            <WifiOff size={14} /> Armazenamento local
          </div>
        </aside>
        <div className="demo-main">
          <div className="demo-heading">
            <div>
              <span className="micro">SEU ESPAÇO PRIVADO</span>
              <h3>
                Meu cofre<span>03</span>
              </h3>
            </div>
            <LockKeyhole size={18} />
          </div>
          <div
            className="demo-accounts"
            role="tablist"
            aria-label="Contas de exemplo"
          >
            {demoItems.map((item, i) => (
              <button
                key={item.name}
                type="button"
                role="tab"
                aria-selected={active === i}
                tabIndex={active === i ? 0 : -1}
                onKeyDown={(event) => {
                  const step = ["ArrowRight", "ArrowDown"].includes(event.key)
                    ? 1
                    : ["ArrowLeft", "ArrowUp"].includes(event.key)
                      ? -1
                      : 0;
                  if (!step && event.key !== "Home" && event.key !== "End")
                    return;
                  event.preventDefault();
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? demoItems.length - 1
                        : (active + step + demoItems.length) % demoItems.length;
                  setActive(next);
                  setCopied(false);
                  document.getElementById(`demo-tab-${next}`)?.focus();
                }}
                aria-controls="demo-code"
                id={`demo-tab-${i}`}
                className={active === i ? "selected" : ""}
                onClick={() => {
                  setActive(i);
                  setCopied(false);
                }}
              >
                <span className="account-letter">{item.letter}</span>
                <span>
                  {item.name}
                  <small>{item.label}</small>
                </span>
                <span className="account-dots">•••</span>
              </button>
            ))}
          </div>
          <div
            className="demo-code"
            id="demo-code"
            role="tabpanel"
            aria-labelledby={`demo-tab-${active}`}
          >
            <div>
              <span className="micro">CÓDIGO ILUSTRATIVO</span>
              <button
                aria-label="Simular cópia do código"
                onClick={() => setCopied(true)}
              >
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
            <strong key={active}>{demoItems[active].code}</strong>
            <div className="demo-progress">
              <span />
            </div>
            <small aria-live="polite">
              {copied
                ? "Simulação concluída. Nenhum código real copiado."
                : "Dados fictícios. Explore as contas acima."}
            </small>
          </div>
        </div>
      </div>
    </div>
  );
}
