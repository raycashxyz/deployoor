import { Handler } from "vocs/server";

export default function handler(request: Request) {
  return Handler.og(({ title, description }) => (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: "100%",
        height: "100%",
        padding: 80,
        backgroundColor: "#111513",
        color: "#ffffff",
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#bef4be", fontSize: 32 }}>
        <div style={{ width: 20, height: 20, borderRadius: 999, backgroundColor: "#bef4be" }} />
        deployoor
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 1000 }}>
        <div style={{ fontSize: 64, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        {description && (
          <div style={{ color: "rgba(255, 255, 255, 0.68)", fontSize: 28, lineHeight: 1.35 }}>
            {description}
          </div>
        )}
      </div>

      <div style={{ color: "#bef4be", fontSize: 24 }}>deployoor.dev</div>
    </div>
  )).fetch(request);
}
