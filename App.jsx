import { useState, useEffect } from "react";

const SITES_DATA = [
  { id: "s1", domain: "acme-corp.com", status: "active", php: "8.3", ssl: true, sslExpiry: "2026-01-15", ram: 128, cpu: 3, traffic: "4.2 GB", uptime: "99.98%", created: "2024-11-03", wpVersion: "6.7.1", plugins: 12, redis: true, staging: true, theme: "Astra", lastBackup: "2h ago", backupSize: "892 MB" },
  { id: "s2", domain: "studio-nova.design", status: "active", php: "8.3", ssl: true, sslExpiry: "2025-12-30", ram: 96, cpu: 1, traffic: "1.1 GB", uptime: "100%", created: "2024-12-01", wpVersion: "6.7.1", plugins: 8, redis: true, staging: false, theme: "Divi", lastBackup: "6h ago", backupSize: "441 MB" },
  { id: "s3", domain: "shopbloom.store", status: "active", php: "8.2", ssl: true, sslExpiry: "2025-11-08", ram: 210, cpu: 7, traffic: "18.7 GB", uptime: "99.94%", created: "2024-09-22", wpVersion: "6.6.2", plugins: 24, redis: true, staging: true, theme: "Flatsome", lastBackup: "1h ago", backupSize: "3.1 GB" },
  { id: "s4", domain: "healthpulse.clinic", status: "provisioning", php: "8.3", ssl: false, sslExpiry: null, ram: 0, cpu: 0, traffic: "—", uptime: "—", created: "2025-01-02", wpVersion: "—", plugins: 0, redis: true, staging: false, theme: "—", lastBackup: "—", backupSize: "—" },
  { id: "s5", domain: "legalwise.io", status: "error", php: "8.1", ssl: true, sslExpiry: "2025-10-14", ram: 48, cpu: 0, traffic: "0.3 GB", uptime: "87.1%", created: "2024-10-10", wpVersion: "6.5.5", plugins: 6, redis: false, staging: false, theme: "OceanWP", lastBackup: "3d ago", backupSize: "220 MB" },
];

const BACKUPS_DATA = [
  { id: "b1", siteId: "s1", archive: "acme-corp.com-2025-01-02T03:00", size: "892 MB", status: "success", created: "Jan 2, 03:00" },
  { id: "b2", siteId: "s1", archive: "acme-corp.com-2025-01-01T03:00", size: "887 MB", status: "success", created: "Jan 1, 03:00" },
  { id: "b3", siteId: "s3", archive: "shopbloom.store-2025-01-02T03:00", size: "3.1 GB", status: "success", created: "Jan 2, 03:00" },
  { id: "b4", siteId: "s5", archive: "legalwise.io-2024-12-30T03:00", size: "220 MB", status: "failed", created: "Dec 30, 03:00" },
];

const SECURITY_EVENTS = [
  { id: "e1", type: "brute_force", ip: "91.108.4.42", target: "shopbloom.store", time: "12m ago", action: "Banned (fail2ban)" },
  { id: "e2", type: "xmlrpc_scan", ip: "185.220.101.7", target: "acme-corp.com", time: "1h ago", action: "Blocked (UFW)" },
  { id: "e3", type: "wp_admin_scan", ip: "46.161.27.113", target: "legalwise.io", time: "2h ago", action: "Rate limited" },
  { id: "e4", type: "ssl_renewal", ip: "—", target: "studio-nova.design", time: "6h ago", action: "Cert renewed (90d)" },
];

const PHP_VERSIONS = ["8.3", "8.2", "8.1", "8.0"];
const DNS_PROVIDERS = ["Cloudflare", "Route 53", "DigitalOcean", "Manual"];

const statusColors = {
  active: { dot: "#10b981", bg: "#052e16", text: "#6ee7b7", label: "Active" },
  provisioning: { dot: "#f59e0b", bg: "#1c1400", text: "#fcd34d", label: "Provisioning" },
  error: { dot: "#ef4444", bg: "#2a0a0a", text: "#fca5a5", label: "Error" },
  stopped: { dot: "#6b7280", bg: "#111827", text: "#9ca3af", label: "Stopped" },
};

const NAV_ITEMS = [
  { id: "sites", icon: "▤", label: "Sites" },
  { id: "servers", icon: "⬡", label: "Servers" },
  { id: "backups", icon: "⊕", label: "Backups" },
  { id: "dns", icon: "◎", label: "DNS" },
  { id: "ssl", icon: "⊛", label: "SSL Certs" },
  { id: "security", icon: "⊗", label: "Security" },
  { id: "settings", icon: "⊙", label: "Settings" },
];

function Badge({ status }) {
  const c = statusColors[status] || statusColors.stopped;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "3px 9px", borderRadius: 20, background: c.bg, border: `1px solid ${c.dot}22`, fontSize: 11, fontWeight: 500, color: c.text, letterSpacing: "0.04em", fontFamily: "monospace" }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot, boxShadow: status === "active" ? `0 0 6px ${c.dot}` : "none", display: "inline-block", flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function Pill({ label, color = "#374151" }) {
  return <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, background: color + "22", color, border: `1px solid ${color}44`, fontFamily: "monospace" }}>{label}</span>;
}

function ProgressBar({ value, max = 100, color = "#10b981" }) {
  const pct = Math.round((value / max) * 100);
  const c = pct > 80 ? "#ef4444" : pct > 60 ? "#f59e0b" : color;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#1f2937", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: c, borderRadius: 2, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 11, color: "#9ca3af", minWidth: 30, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function Modal({ title, onClose, children, width = 560 }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#0f172a", border: "1px solid #1e3a5f", borderRadius: 12, width: "100%", maxWidth: width, maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #1e293b" }}>
          <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 15, fontFamily: "'DM Sans', sans-serif" }}>{title}</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: 18, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ padding: "24px" }}>{children}</div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, placeholder, type = "text", hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.04em", fontFamily: "monospace" }}>{label}</label>
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }}
      />
      {hint && <p style={{ fontSize: 11, color: "#475569", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 12, color: "#94a3b8", marginBottom: 6, letterSpacing: "0.04em", fontFamily: "monospace" }}>{label}</label>
      <select value={value} onChange={onChange}
        style={{ width: "100%", background: "#1e293b", border: "1px solid #334155", borderRadius: 7, padding: "9px 12px", color: "#e2e8f0", fontSize: 13, fontFamily: "monospace", boxSizing: "border-box", outline: "none" }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange, description }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 12 }}>
      <div>
        <div style={{ fontSize: 13, color: "#cbd5e1" }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{description}</div>}
      </div>
      <div onClick={onChange} style={{ width: 40, height: 22, borderRadius: 11, background: checked ? "#10b981" : "#334155", cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
        <div style={{ position: "absolute", top: 3, left: checked ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
      </div>
    </div>
  );
}

function DeployButton({ onClick, loading, label = "Deploy Site" }) {
  return (
    <button onClick={onClick} disabled={loading}
      style={{ width: "100%", padding: "12px", background: loading ? "#065f46" : "linear-gradient(135deg, #059669, #10b981)", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 14, cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, fontFamily: "'DM Sans', sans-serif" }}>
      {loading ? (
        <>
          <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #6ee7b7", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
          Provisioning...
        </>
      ) : label}
    </button>
  );
}

// ─── Create Site Modal ──────────────────────────────────────────────────────
function CreateSiteModal({ onClose, onCreate }) {
  const [form, setForm] = useState({ domain: "", php: "8.3", adminEmail: "", dnsProvider: "Cloudflare", redis: true, staging: false, autoSSL: true, autoBackup: true });
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [provLog, setProvLog] = useState([]);

  const f = (key) => (e) => setForm(p => ({ ...p, [key]: e.target.value }));
  const t = (key) => () => setForm(p => ({ ...p, [key]: !p[key] }));

  const handleDeploy = async () => {
    if (!form.domain) return;
    setStep(2);
    setLoading(true);
    const steps = [
      "Creating directory structure...",
      `Provisioning MariaDB database...`,
      `Pulling wordpress:${form.php}-fpm image...`,
      `Starting PHP-FPM container...`,
      form.redis ? "Starting Redis container..." : null,
      "Writing Nginx config with FastCGI cache...",
      "Reloading Nginx...",
      form.autoSSL ? "Requesting Let's Encrypt certificate..." : null,
      "Installing WordPress via WP-CLI...",
      form.redis ? "Enabling Redis Object Cache plugin..." : null,
      "Configuring FastCGI cache purge plugin...",
      form.autoBackup ? "Scheduling BorgBackup (daily 03:00)..." : null,
      `✔ ${form.domain} is live!`,
    ].filter(Boolean);

    for (const s of steps) {
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      setProvLog(p => [...p, s]);
    }
    setLoading(false);
    setTimeout(() => { onCreate(form); onClose(); }, 1200);
  };

  return (
    <Modal title="Create New Site" onClose={onClose} width={600}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      {step === 1 ? (
        <>
          <Input label="DOMAIN" value={form.domain} onChange={f("domain")} placeholder="client-site.com" hint="Do not include https:// or www" />
          <Input label="ADMIN EMAIL" value={form.adminEmail} onChange={f("adminEmail")} placeholder="admin@client-site.com" type="email" />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Select label="PHP VERSION" value={form.php} onChange={f("php")} options={PHP_VERSIONS} />
            <Select label="DNS PROVIDER" value={form.dnsProvider} onChange={f("dnsProvider")} options={DNS_PROVIDERS} />
          </div>
          <div style={{ background: "#0f1f33", border: "1px solid #1e3a5f", borderRadius: 8, padding: "16px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#64748b", marginBottom: 12, letterSpacing: "0.06em", fontFamily: "monospace" }}>STACK OPTIONS</div>
            <Toggle label="Redis Object Cache" description="Persistent in-memory caching layer (recommended)" checked={form.redis} onChange={t("redis")} />
            <Toggle label="Auto SSL (Let's Encrypt)" description="Request and auto-renew TLS certificate" checked={form.autoSSL} onChange={t("autoSSL")} />
            <Toggle label="Create Staging Environment" description="staging.domain.com with isolated containers" checked={form.staging} onChange={t("staging")} />
            <Toggle label="Daily BorgBackup" description="Encrypted incremental backups at 03:00 UTC" checked={form.autoBackup} onChange={t("autoBackup")} />
          </div>
          <div style={{ background: "#042818", border: "1px solid #065f46", borderRadius: 8, padding: "12px 14px", marginBottom: 20, fontSize: 12, color: "#6ee7b7", fontFamily: "monospace" }}>
            Stack: Nginx + FastCGI Cache → PHP-FPM {form.php} → MariaDB 11 {form.redis ? "+ Redis 7" : ""}
          </div>
          <DeployButton onClick={handleDeploy} loading={false} />
        </>
      ) : (
        <div style={{ fontFamily: "monospace", fontSize: 12 }}>
          <div style={{ background: "#020917", border: "1px solid #0f2a3d", borderRadius: 8, padding: "16px", minHeight: 280, maxHeight: 380, overflowY: "auto" }}>
            <div style={{ color: "#6ee7b7", marginBottom: 8 }}>$ wpcloud provision {form.domain}</div>
            {provLog.map((l, i) => (
              <div key={i} style={{ color: l.startsWith("✔") ? "#10b981" : "#94a3b8", marginBottom: 4, display: "flex", gap: 8 }}>
                <span style={{ color: "#374151" }}>{String(i + 1).padStart(2, "0")}</span>
                <span>{l}</span>
              </div>
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: "#f59e0b", marginTop: 4 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                running...
              </div>
            )}
          </div>
          {!loading && <div style={{ marginTop: 12, padding: "10px 14px", background: "#052e16", border: "1px solid #065f46", borderRadius: 8, color: "#6ee7b7", fontSize: 12 }}>🟢 Site deployed — visit https://{form.domain}</div>}
        </div>
      )}
    </Modal>
  );
}

// ─── Site Detail Modal ──────────────────────────────────────────────────────
function SiteDetailModal({ site, onClose }) {
  const [tab, setTab] = useState("overview");
  const tabs = ["overview", "backups", "staging", "security", "wp-cli"];

  return (
    <Modal title={site.domain} onClose={onClose} width={680}>
      <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "1px solid #1e293b", paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: "6px 14px", background: tab === t ? "#0f2a3d" : "none", border: "none", borderBottom: tab === t ? "2px solid #10b981" : "2px solid transparent", color: tab === t ? "#10b981" : "#64748b", cursor: "pointer", fontSize: 12, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.04em", transition: "all 0.15s" }}>
            {t}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
            {[["RAM", `${site.ram} MB`, "#3b82f6"], ["CPU", `${site.cpu}%`, "#f59e0b"], ["Traffic", site.traffic, "#10b981"]].map(([l, v, c]) => (
              <div key={l} style={{ background: "#0f1f33", border: "1px solid #1e3a5f", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, color: "#64748b", fontFamily: "monospace", letterSpacing: "0.06em", marginBottom: 4 }}>{l}</div>
                <div style={{ fontSize: 22, fontWeight: 600, color: c, fontFamily: "monospace" }}>{v}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["WordPress", site.wpVersion], ["PHP", site.php], ["Plugins", site.plugins], ["Theme", site.theme], ["Uptime", site.uptime], ["SSL Expiry", site.sslExpiry || "—"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #0f2a3d" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>{k}</span>
                <span style={{ fontSize: 12, color: "#cbd5e1", fontFamily: "monospace" }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
            {[["Purge All Cache", "#0f2a3d", "#10b981"], ["Update WordPress", "#1c1400", "#f59e0b"], ["Restart Containers", "#1a0e2e", "#8b5cf6"]].map(([l, bg, c]) => (
              <button key={l} style={{ padding: "8px 14px", background: bg, border: `1px solid ${c}44`, borderRadius: 6, color: c, fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>{l}</button>
            ))}
          </div>
        </div>
      )}
      {tab === "backups" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
            <span style={{ fontSize: 12, color: "#64748b" }}>BorgBackup — 7d daily, 4w weekly, 6m monthly</span>
            <button style={{ padding: "6px 14px", background: "#042818", border: "1px solid #065f46", borderRadius: 6, color: "#10b981", fontSize: 12, cursor: "pointer" }}>Run Now</button>
          </div>
          {BACKUPS_DATA.filter(b => b.siteId === site.id).map(b => (
            <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 7, marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 12, color: "#cbd5e1", fontFamily: "monospace" }}>{b.archive}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{b.created} · {b.size}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge status={b.status === "success" ? "active" : "error"} />
                <button style={{ padding: "4px 10px", background: "#0f2a3d", border: "1px solid #1e3a5f", borderRadius: 5, color: "#7dd3fc", fontSize: 11, cursor: "pointer" }}>Restore</button>
              </div>
            </div>
          ))}
          {BACKUPS_DATA.filter(b => b.siteId === site.id).length === 0 && (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 13, padding: "30px 0" }}>No backups yet</div>
          )}
        </div>
      )}
      {tab === "staging" && (
        <div>
          {site.staging ? (
            <div>
              <div style={{ background: "#0f1f33", border: "1px solid #1e3a5f", borderRadius: 8, padding: "14px", marginBottom: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ color: "#e2e8f0", fontSize: 13, fontFamily: "monospace" }}>staging.{site.domain}</div>
                    <div style={{ color: "#475569", fontSize: 11, marginTop: 3 }}>Isolated containers · Cloned from production</div>
                  </div>
                  <Badge status="active" />
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={{ padding: "8px 16px", background: "#042818", border: "1px solid #065f46", borderRadius: 6, color: "#10b981", fontSize: 12, cursor: "pointer" }}>Push to Production</button>
                <button style={{ padding: "8px 16px", background: "#0f2a3d", border: "1px solid #1e3a5f", borderRadius: 6, color: "#7dd3fc", fontSize: 12, cursor: "pointer" }}>Sync from Production</button>
              </div>
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "30px 0" }}>
              <div style={{ color: "#64748b", fontSize: 13, marginBottom: 16 }}>No staging environment yet</div>
              <button style={{ padding: "10px 20px", background: "#042818", border: "1px solid #065f46", borderRadius: 7, color: "#10b981", fontSize: 13, cursor: "pointer" }}>Create Staging Site</button>
            </div>
          )}
        </div>
      )}
      {tab === "security" && (
        <div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
            {[["UFW Firewall", "active"], ["fail2ban", "active"], ["Malware Scan", site.id === "s5" ? "error" : "active"]].map(([l, s]) => (
              <div key={l} style={{ padding: "8px 14px", background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 7, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: s === "active" ? "#10b981" : "#ef4444" }} />
                <span style={{ fontSize: 12, color: "#cbd5e1" }}>{l}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, fontFamily: "monospace" }}>RECENT EVENTS FOR {site.domain.toUpperCase()}</div>
          {SECURITY_EVENTS.filter(e => e.target === site.domain).map(ev => (
            <div key={ev.id} style={{ padding: "8px 12px", background: "#120a0a", border: "1px solid #2a0a0a", borderRadius: 6, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 12, color: "#fca5a5", fontFamily: "monospace" }}>{ev.type}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>IP: {ev.ip} · {ev.time}</div>
              </div>
              <span style={{ fontSize: 11, color: "#6ee7b7", background: "#052e16", padding: "3px 8px", borderRadius: 4 }}>{ev.action}</span>
            </div>
          ))}
          {SECURITY_EVENTS.filter(e => e.target === site.domain).length === 0 && (
            <div style={{ textAlign: "center", color: "#475569", fontSize: 13, padding: "20px 0" }}>No events for this site</div>
          )}
        </div>
      )}
      {tab === "wp-cli" && (
        <div>
          <div style={{ fontSize: 11, color: "#64748b", marginBottom: 10, fontFamily: "monospace" }}>WP-CLI — executed inside container wp_{site.id}_phpfpm</div>
          <div style={{ background: "#020917", border: "1px solid #0f2a3d", borderRadius: 8, padding: "14px", fontFamily: "monospace", fontSize: 12, minHeight: 180 }}>
            <div style={{ color: "#6ee7b7", marginBottom: 8 }}>$ docker exec -u www-data wp_{site.id}_phpfpm wp</div>
            <div style={{ color: "#64748b" }}>WordPress CLI — try commands below</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {["wp core version", "wp plugin list", "wp theme list", "wp user list", "wp cache flush", "wp cron event run --due-now"].map(cmd => (
              <button key={cmd} style={{ padding: "5px 10px", background: "#0f1f33", border: "1px solid #1e3a5f", borderRadius: 5, color: "#7dd3fc", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>{cmd}</button>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Sites Panel ─────────────────────────────────────────────────────────────
function SitesPanel({ sites, onNew, onDetail }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? sites : sites.filter(s => s.status === filter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>Sites</h2>
          <p style={{ color: "#475569", fontSize: 12, margin: "3px 0 0", fontFamily: "monospace" }}>{sites.length} total · {sites.filter(s => s.status === "active").length} active</p>
        </div>
        <button onClick={onNew} style={{ padding: "10px 18px", background: "#059669", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Site
        </button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {[["all", "All"], ["active", "Active"], ["provisioning", "Provisioning"], ["error", "Error"]].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)}
            style={{ padding: "5px 12px", background: filter === val ? "#0f2a3d" : "transparent", border: `1px solid ${filter === val ? "#1e3a5f" : "#1e293b"}`, borderRadius: 20, color: filter === val ? "#7dd3fc" : "#475569", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>
            {label}
          </button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filtered.map(site => (
          <div key={site.id} onClick={() => onDetail(site)}
            style={{ background: "#0a1929", border: "1px solid #1e293b", borderRadius: 10, padding: "16px 18px", cursor: "pointer", transition: "border-color 0.15s", ":hover": { borderColor: "#1e3a5f" } }}
            onMouseEnter={e => e.currentTarget.style.borderColor = "#1e3a5f"}
            onMouseLeave={e => e.currentTarget.style.borderColor = "#1e293b"}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600, fontFamily: "monospace", marginBottom: 2 }}>{site.domain}</div>
                <div style={{ fontSize: 11, color: "#475569" }}>Created {site.created}</div>
              </div>
              <Badge status={site.status} />
            </div>
            {site.status === "active" && (
              <>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#475569" }}>RAM</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{site.ram} MB</span>
                  </div>
                  <ProgressBar value={site.ram} max={512} color="#3b82f6" />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#475569" }}>CPU</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{site.cpu}%</span>
                  </div>
                  <ProgressBar value={site.cpu} max={100} color="#f59e0b" />
                </div>
              </>
            )}
            {site.status === "provisioning" && (
              <div style={{ padding: "10px 0", fontSize: 12, color: "#f59e0b", fontFamily: "monospace", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 10, height: 10, border: "1.5px solid #f59e0b", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                Provisioning containers...
              </div>
            )}
            {site.status === "error" && (
              <div style={{ padding: "8px 10px", background: "#2a0a0a", border: "1px solid #7f1d1d", borderRadius: 6, fontSize: 11, color: "#fca5a5", marginBottom: 10, fontFamily: "monospace" }}>
                Container health check failed
              </div>
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <Pill label={`PHP ${site.php}`} color="#3b82f6" />
              {site.ssl && <Pill label="SSL" color="#10b981" />}
              {site.redis && <Pill label="Redis" color="#8b5cf6" />}
              {site.staging && <Pill label="Staging" color="#f59e0b" />}
              {site.status === "active" && <Pill label={`↑ ${site.uptime}`} color="#10b981" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Security Panel ──────────────────────────────────────────────────────────
function SecurityPanel() {
  return (
    <div>
      <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>Security</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[["UFW Firewall", "active", "3 rules"], ["fail2ban", "active", "4 jails"], ["Certbot", "active", "Auto-renew on"]].map(([l, s, sub]) => (
          <div key={l} style={{ background: "#0a1929", border: "1px solid #1e293b", borderRadius: 8, padding: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 13, color: "#cbd5e1" }}>{l}</span>
              <Badge status={s} />
            </div>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{sub}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 10, fontFamily: "monospace" }}>RECENT EVENTS</div>
      {SECURITY_EVENTS.map(ev => (
        <div key={ev.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 8, marginBottom: 6 }}>
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 12, color: ev.type.includes("ssl") ? "#6ee7b7" : "#fca5a5", fontFamily: "monospace" }}>{ev.type}</span>
            <span style={{ fontSize: 11, color: "#475569", marginLeft: 10 }}>→ {ev.target}</span>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{ev.ip} · {ev.time}</div>
            <div style={{ fontSize: 11, color: "#6ee7b7", marginTop: 2 }}>{ev.action}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── SSL Panel ───────────────────────────────────────────────────────────────
function SSLPanel({ sites }) {
  const sslSites = sites.filter(s => s.ssl);
  const today = new Date("2025-01-03");
  return (
    <div>
      <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>SSL Certificates</h2>
      {sslSites.map(s => {
        const expiry = s.sslExpiry ? new Date(s.sslExpiry) : null;
        const daysLeft = expiry ? Math.ceil((expiry - today) / 86400000) : null;
        const urgent = daysLeft !== null && daysLeft < 30;
        return (
          <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", background: "#0a1929", border: `1px solid ${urgent ? "#92400e" : "#1e293b"}`, borderRadius: 8, marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 13, color: "#e2e8f0", fontFamily: "monospace" }}>{s.domain}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>Let's Encrypt · Expires {s.sslExpiry}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {daysLeft !== null ? (
                <div style={{ fontSize: 13, fontFamily: "monospace", color: urgent ? "#fcd34d" : "#10b981" }}>{daysLeft}d left</div>
              ) : null}
              <button style={{ marginTop: 4, padding: "4px 10px", background: "#0f2a3d", border: "1px solid #1e3a5f", borderRadius: 5, color: "#7dd3fc", fontSize: 11, cursor: "pointer" }}>Renew</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Backups Panel ───────────────────────────────────────────────────────────
function BackupsPanel({ sites }) {
  return (
    <div>
      <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, marginBottom: 8, fontFamily: "'DM Sans', sans-serif" }}>Backups</h2>
      <p style={{ color: "#475569", fontSize: 12, marginBottom: 20, fontFamily: "monospace" }}>BorgBackup — encrypted, deduplicated, incremental. 7d daily · 4w weekly · 6m monthly</p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
        {[["Total Archives", "47"], ["Storage Used", "12.4 GB"], ["Dedup Ratio", "4.2×"]].map(([l, v]) => (
          <div key={l} style={{ background: "#0a1929", border: "1px solid #1e293b", borderRadius: 8, padding: "14px" }}>
            <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace", marginBottom: 6 }}>{l}</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: "#10b981", fontFamily: "monospace" }}>{v}</div>
          </div>
        ))}
      </div>
      {BACKUPS_DATA.map(b => {
        const site = sites.find(s => s.id === b.siteId);
        return (
          <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#0a0e1a", border: "1px solid #1e293b", borderRadius: 8, marginBottom: 6 }}>
            <div>
              <div style={{ fontSize: 12, color: "#cbd5e1", fontFamily: "monospace" }}>{b.archive}</div>
              <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{site?.domain} · {b.created} · {b.size}</div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Badge status={b.status === "success" ? "active" : "error"} />
              <button style={{ padding: "4px 10px", background: "#0f2a3d", border: "1px solid #1e3a5f", borderRadius: 5, color: "#7dd3fc", fontSize: 11, cursor: "pointer" }}>Restore</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Settings Panel ──────────────────────────────────────────────────────────
function SettingsPanel() {
  const [form, setForm] = useState({ letsEncryptEmail: "ops@example.com", borgPassphrase: "••••••••••••", cloudflareToken: "", awsKey: "", slackWebhook: "", smtpHost: "smtp.example.com", maintenanceMode: false });
  const f = k => e => setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <div>
      <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>Settings</h2>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginBottom: 12, letterSpacing: "0.06em" }}>SSL & CERTBOT</div>
          <Input label="LET'S ENCRYPT EMAIL" value={form.letsEncryptEmail} onChange={f("letsEncryptEmail")} />
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginBottom: 12, marginTop: 8, letterSpacing: "0.06em" }}>BACKUPS</div>
          <Input label="BORG PASSPHRASE" value={form.borgPassphrase} onChange={f("borgPassphrase")} type="password" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginBottom: 12, letterSpacing: "0.06em" }}>DNS PROVIDERS</div>
          <Input label="CLOUDFLARE API TOKEN" value={form.cloudflareToken} onChange={f("cloudflareToken")} placeholder="cf-token..." />
          <Input label="AWS ACCESS KEY (Route 53)" value={form.awsKey} onChange={f("awsKey")} placeholder="AKIA..." />
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace", marginBottom: 12, letterSpacing: "0.06em" }}>NOTIFICATIONS</div>
          <Input label="SLACK WEBHOOK URL" value={form.slackWebhook} onChange={f("slackWebhook")} placeholder="https://hooks.slack.com/..." />
          <Input label="SMTP HOST" value={form.smtpHost} onChange={f("smtpHost")} />
        </div>
      </div>
      <button style={{ marginTop: 20, padding: "10px 24px", background: "#059669", border: "none", borderRadius: 7, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>Save Settings</button>
    </div>
  );
}

// ─── DNS Panel ───────────────────────────────────────────────────────────────
function DNSPanel({ sites }) {
  const [sel, setSel] = useState(sites[0]?.id);
  const site = sites.find(s => s.id === sel);
  const mockRecords = [
    { type: "A", name: "@", value: "203.0.113.42", ttl: "Auto" },
    { type: "A", name: "www", value: "203.0.113.42", ttl: "Auto" },
    { type: "A", name: "staging", value: "203.0.113.42", ttl: "Auto" },
    { type: "MX", name: "@", value: "mail.example.com", ttl: "3600" },
    { type: "TXT", name: "@", value: "v=spf1 include:_spf.google.com ~all", ttl: "3600" },
  ];
  return (
    <div>
      <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, marginBottom: 20, fontFamily: "'DM Sans', sans-serif" }}>DNS Management</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        {sites.filter(s => s.status === "active").map(s => (
          <button key={s.id} onClick={() => setSel(s.id)}
            style={{ padding: "6px 14px", background: sel === s.id ? "#0f2a3d" : "transparent", border: `1px solid ${sel === s.id ? "#1e3a5f" : "#1e293b"}`, borderRadius: 20, color: sel === s.id ? "#7dd3fc" : "#475569", fontSize: 12, cursor: "pointer", fontFamily: "monospace" }}>
            {s.domain}
          </button>
        ))}
      </div>
      {site && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>CLOUDFLARE · {site.domain}</span>
            <button style={{ padding: "6px 14px", background: "#042818", border: "1px solid #065f46", borderRadius: 6, color: "#10b981", fontSize: 12, cursor: "pointer" }}>Add Record</button>
          </div>
          <div style={{ background: "#020917", border: "1px solid #0f2a3d", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 80px 80px", gap: 0, padding: "8px 14px", borderBottom: "1px solid #0f2a3d" }}>
              {["TYPE", "NAME", "VALUE", "TTL", ""].map(h => <span key={h} style={{ fontSize: 10, color: "#374151", fontFamily: "monospace", letterSpacing: "0.06em" }}>{h}</span>)}
            </div>
            {mockRecords.map((r, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr 80px 80px", gap: 0, padding: "10px 14px", borderBottom: i < mockRecords.length - 1 ? "1px solid #0f172a" : "none" }}>
                <span style={{ fontSize: 12, color: r.type === "A" ? "#60a5fa" : r.type === "MX" ? "#f59e0b" : "#a78bfa", fontFamily: "monospace" }}>{r.type}</span>
                <span style={{ fontSize: 12, color: "#cbd5e1", fontFamily: "monospace" }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "#64748b", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</span>
                <span style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>{r.ttl}</span>
                <button style={{ padding: "2px 8px", background: "transparent", border: "1px solid #1e293b", borderRadius: 4, color: "#64748b", fontSize: 11, cursor: "pointer" }}>Edit</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Servers Panel ───────────────────────────────────────────────────────────
function ServersPanel() {
  const servers = [
    { id: "srv1", name: "prod-ams3", host: "203.0.113.42", region: "Amsterdam", provider: "DigitalOcean", sites: 4, ram: 68, cpu: 24, disk: 41, os: "Ubuntu 24.04", status: "active" },
    { id: "srv2", name: "prod-fra1", host: "198.51.100.7", region: "Frankfurt", provider: "Hetzner", sites: 1, ram: 22, cpu: 8, disk: 12, os: "Ubuntu 22.04", status: "active" },
  ];
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ color: "#e2e8f0", fontSize: 20, fontWeight: 600, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>Servers</h2>
        <button style={{ padding: "10px 18px", background: "#059669", border: "none", borderRadius: 8, color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>+ Add Server</button>
      </div>
      <div style={{ display: "grid", gap: 12 }}>
        {servers.map(s => (
          <div key={s.id} style={{ background: "#0a1929", border: "1px solid #1e293b", borderRadius: 10, padding: "18px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
              <div>
                <div style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, fontFamily: "monospace" }}>{s.name}</div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{s.host} · {s.provider} · {s.region} · {s.os}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <Badge status={s.status} />
                <span style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace" }}>{s.sites} site{s.sites !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              {[["RAM", s.ram, 100, "#3b82f6"], ["CPU", s.cpu, 100, "#f59e0b"], ["Disk", s.disk, 100, "#10b981"]].map(([l, v, max, c]) => (
                <div key={l}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#475569" }}>{l}</span>
                    <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{v}%</span>
                  </div>
                  <ProgressBar value={v} max={max} color={c} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── App Shell ───────────────────────────────────────────────────────────────
export default function App() {
  const [section, setSection] = useState("sites");
  const [showCreate, setShowCreate] = useState(false);
  const [detailSite, setDetailSite] = useState(null);
  const [sites, setSites] = useState(SITES_DATA);

  const handleCreate = (form) => {
    const newSite = {
      id: `s${Date.now()}`, domain: form.domain, status: "active", php: form.php,
      ssl: form.autoSSL, sslExpiry: "2026-04-03", ram: 48, cpu: 2, traffic: "0 GB",
      uptime: "100%", created: new Date().toISOString().slice(0, 10), wpVersion: "6.7.1",
      plugins: 3, redis: form.redis, staging: form.staging, theme: "Twenty Twenty-Five",
      lastBackup: "—", backupSize: "—",
    };
    setSites(p => [...p, newSite]);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#020917", fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-track { background: #0a0e1a; } ::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 2px; }
      `}</style>

      {/* Sidebar */}
      <div style={{ width: 220, background: "#040d1a", borderRight: "1px solid #0f2a3d", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 20px 16px", borderBottom: "1px solid #0f2a3d" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, background: "#059669", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <div>
              <div style={{ color: "#e2e8f0", fontSize: 14, fontWeight: 600 }}>WPCloud</div>
              <div style={{ color: "#475569", fontSize: 10, fontFamily: "monospace" }}>v1.0.0</div>
            </div>
          </div>
        </div>
        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV_ITEMS.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: section === item.id ? "#0f2a3d" : "transparent", border: "none", borderRadius: 7, color: section === item.id ? "#7dd3fc" : "#475569", cursor: "pointer", marginBottom: 2, textAlign: "left", fontSize: 13, transition: "all 0.15s" }}
              onMouseEnter={e => { if (section !== item.id) e.currentTarget.style.background = "#0a1929"; e.currentTarget.style.color = "#94a3b8"; }}
              onMouseLeave={e => { if (section !== item.id) e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = section === item.id ? "#7dd3fc" : "#475569"; }}>
              <span style={{ fontSize: 16, width: 18, textAlign: "center" }}>{item.icon}</span>
              {item.label}
              {item.id === "sites" && <span style={{ marginLeft: "auto", fontSize: 10, background: "#0f2a3d", color: "#64748b", padding: "1px 6px", borderRadius: 10, fontFamily: "monospace" }}>{sites.length}</span>}
            </button>
          ))}
        </nav>
        <div style={{ padding: "12px 16px", borderTop: "1px solid #0f2a3d" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#0a1929", borderRadius: 7 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#1e3a5f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#7dd3fc", fontWeight: 600 }}>A</div>
            <div>
              <div style={{ fontSize: 12, color: "#cbd5e1" }}>admin</div>
              <div style={{ fontSize: 10, color: "#475569", fontFamily: "monospace" }}>203.0.113.42</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Top bar */}
        <div style={{ background: "#040d1a", borderBottom: "1px solid #0f2a3d", padding: "12px 28px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 11, color: "#475569", fontFamily: "monospace" }}>
            wpcloud / <span style={{ color: "#64748b" }}>{section}</span>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ padding: "5px 12px", background: "#052e16", border: "1px solid #065f46", borderRadius: 20, fontSize: 11, color: "#10b981", fontFamily: "monospace" }}>
              ● API running · :8080
            </div>
            <div style={{ padding: "5px 12px", background: "#0f2a3d", border: "1px solid #1e3a5f", borderRadius: 20, fontSize: 11, color: "#7dd3fc", fontFamily: "monospace" }}>
              {sites.filter(s => s.status === "active").length}/{sites.length} active
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: "28px 32px" }}>
          {section === "sites" && <SitesPanel sites={sites} onNew={() => setShowCreate(true)} onDetail={setDetailSite} />}
          {section === "servers" && <ServersPanel />}
          {section === "backups" && <BackupsPanel sites={sites} />}
          {section === "dns" && <DNSPanel sites={sites} />}
          {section === "ssl" && <SSLPanel sites={sites} />}
          {section === "security" && <SecurityPanel />}
          {section === "settings" && <SettingsPanel />}
        </div>
      </div>

      {showCreate && <CreateSiteModal onClose={() => setShowCreate(false)} onCreate={handleCreate} />}
      {detailSite && <SiteDetailModal site={detailSite} onClose={() => setDetailSite(null)} />}
    </div>
  );
}
