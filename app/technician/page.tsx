export default function TechnicianPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f7f7f5",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "600px" }}>
        <h1
          style={{
            fontSize: "36px",
            marginBottom: "12px",
            color: "#0f172a",
          }}
        >
          TradeWise
        </h1>

        <p
          style={{
            fontSize: "20px",
            color: "#475569",
            marginBottom: "8px",
          }}
        >
          Technician
        </p>

        <p style={{ color: "#64748b" }}>
          Technician workspace is connected.
        </p>
      </div>
    </main>
  )
}
