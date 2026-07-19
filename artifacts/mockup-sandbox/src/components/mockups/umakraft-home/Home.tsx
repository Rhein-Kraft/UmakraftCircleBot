import { useState } from "react";
import { ChevronDown, ChevronUp, Activity, Users, Cpu, Calendar } from "lucide-react";

export function Home() {
  const [expanded, setExpanded] = useState(false);

  const stats = [
    { icon: Activity, label: "UPTIME", value: "3m 23s", sub: "since last restart" },
    { icon: Users, label: "ACTIVE CIRCLES", value: "2", sub: "UmaKraft · UmaKraft 2" },
    { icon: Cpu, label: "MEMORY", value: "96 MB", sub: "of 100 MB heap" },
    { icon: Calendar, label: "SCHEDULED TASKS", value: "28", sub: "active cron jobs" },
  ];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0d0f14 0%, #131720 60%, #0a0d12 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        color: "#e2e8f0",
        position: "relative",
        overflow: "hidden",
        padding: "0 20px",
      }}
    >
      {/* Subtle glow behind title */}
      <div style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -60%)",
        width: 320,
        height: 320,
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* Avatar */}
      <div style={{
        width: 160,
        height: 160,
        borderRadius: "50%",
        overflow: "hidden",
        marginBottom: 24,
        boxShadow: "0 0 48px rgba(124,58,237,0.45), 0 0 0 3px rgba(139,92,246,0.3)",
        flexShrink: 0,
      }}>
        <img
          src="/__mockup/images/avatar.png"
          alt="UmaKraft avatar"
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </div>

      {/* Main Title */}
      <h1 style={{
        fontSize: 52,
        fontWeight: 900,
        letterSpacing: "-2px",
        textAlign: "center",
        margin: 0,
        background: "linear-gradient(135deg, #ffffff 20%, #a78bfa 80%)",
        WebkitBackgroundClip: "text",
        WebkitTextFillColor: "transparent",
        backgroundClip: "text",
        lineHeight: 1.1,
      }}>
        UmaKraft
      </h1>

      {/* Subtitle + online badge */}
      <p style={{
        color: "#64748b",
        fontSize: 13,
        marginTop: 8,
        marginBottom: 20,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        Uma Musume Circle Bot
      </p>

      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        background: "rgba(34,197,94,0.12)",
        border: "1px solid rgba(34,197,94,0.25)",
        borderRadius: 20,
        padding: "5px 14px",
        marginBottom: 40,
      }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%",
          background: "#22c55e",
          boxShadow: "0 0 8px #22c55e",
        }} />
        <span style={{ color: "#22c55e", fontSize: 13, fontWeight: 600, letterSpacing: "0.06em" }}>
          ONLINE
        </span>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 12,
          color: "#94a3b8",
          fontSize: 12,
          fontWeight: 600,
          padding: "8px 20px",
          cursor: "pointer",
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          transition: "all 0.2s",
          marginBottom: expanded ? 20 : 0,
        }}
      >
        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {expanded ? "Hide Details" : "Show Details"}
      </button>

      {/* Expandable stats panel */}
      <div style={{
        width: "100%",
        maxWidth: 340,
        overflow: "hidden",
        maxHeight: expanded ? 600 : 0,
        transition: "max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s",
        opacity: expanded ? 1 : 0,
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 4 }}>
          {stats.map(({ icon: Icon, label, value, sub }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.07)",
              borderRadius: 14,
              padding: "14px 18px",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: "rgba(139,92,246,0.12)",
                border: "1px solid rgba(139,92,246,0.2)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <Icon size={16} color="#a78bfa" />
              </div>
              <div>
                <div style={{ fontSize: 10, color: "#475569", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>
                  {label}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9", lineHeight: 1 }}>
                  {value}
                </div>
                <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                  {sub}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Nav links */}
        <div style={{
          display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap"
        }}>
          {[
            { label: "📊 Dashboard", href: "/report" },
            { label: "📋 Docs", href: "/docs" },
            { label: "⚙️ Tasks", href: "/tasks" },
          ].map(({ label, href }) => (
            <a key={href} href={href} style={{
              flex: 1,
              minWidth: 90,
              background: "rgba(139,92,246,0.1)",
              border: "1px solid rgba(139,92,246,0.2)",
              borderRadius: 10,
              color: "#a78bfa",
              fontSize: 12,
              fontWeight: 600,
              padding: "9px 10px",
              textAlign: "center",
              textDecoration: "none",
              letterSpacing: "0.02em",
            }}>
              {label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
