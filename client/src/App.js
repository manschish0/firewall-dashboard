import { useEffect, useState, useMemo } from "react";

const API = "http://localhost:5001/api";

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(""); // your name for reservations
  const [dur, setDur] = useState({}); // deviceId -> {d,h,m}

  const refresh = async () => {
    setLoading(true);
    const res = await fetch(`${API}/devices`);
    const data = await res.json();
    setRows(data);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 5001); // auto-refresh
    return () => clearInterval(t);
  }, []);

  const canReserve = (r) =>
    r.status === "Up" && r.availability === "Available" && me.trim().length > 0;

  const handleReserve = async (id) => {
    const d = dur[id] || { d:0, h:0, m:0 };
    const body = {
      device_id: id,
      user_name: me.trim(),
      days: Number(d.d || 0),
      hours: Number(d.h || 0),
      minutes: Number(d.m || 0)
    };
    const res = await fetch(`${API}/reserve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const e = await res.json();
      alert(e.error || "Failed to reserve");
    }
    await refresh();
  };

  const handleRelease = async (id) => {
    const res = await fetch(`${API}/release`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: id, user_name: me.trim() })
    });  
    if (!res.ok) {
      const e = await res.json();
      alert(e.error || "Nothing to release");
    }
    await refresh();
  };

  const AvailabilityBadge = ({ r }) => {
    if (r.availability === "Available")
      return <span className="badge badge-available">Available</span>;
    if (r.availability === "In Use")
      return <span className="badge badge-inuse">In Use</span>;
    return <span className="badge badge-na">Not Available</span>;
  };

  return (
    <div className="container">
      <div className="card">
        <h1>Firewall Lab Dashboard</h1>
        <div className="toolbar">
          <input
            className="name-input"
            value={me}
            placeholder="Enter your name (for reservations)"
            onChange={(e) => setMe(e.target.value)}
          />
          <span className="small">Auto-refreshing every 5s</span>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Device</th>
                <th>IP Address</th>
                <th>Telnet Details</th>
                <th>Reserved By</th>
                <th>Availability</th>
                <th>Next Available Time</th>
                <th>Reserve For (D / H / M)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  {/* <td className={r.status === "Up" ? "status-up" : "status-down"}>
                    {r.status}
                  </td> */}
                  <td>{r.deviceIp}</td>
                  <td><code>{r.telnet}</code></td>
                  <td>{r.reservedBy}</td>
                  {/* <td>{r.loginActivity}</td> */}
                  <td><AvailabilityBadge r={r} /></td>
                  <td>{r.nextAvailableTime}</td>
                  <td>
                    {r.availability === "Available" ? (
                      <div className="row-actions">
                        <input
                          className="input-sm"
                          type="number"
                          min="0"
                          placeholder="D"
                          value={(dur[r.id]?.d) ?? ""}
                          onChange={(e) =>
                            setDur({ ...dur, [r.id]: { ...dur[r.id], d: e.target.value } })
                          }
                        />
                        <input
                          className="input-sm"
                          type="number"
                          min="0"
                          placeholder="H"
                          value={(dur[r.id]?.h) ?? ""}
                          onChange={(e) =>
                            setDur({ ...dur, [r.id]: { ...dur[r.id], h: e.target.value } })
                          }
                        />
                        <input
                          className="input-sm"
                          type="number"
                          min="0"
                          placeholder="M"
                          value={(dur[r.id]?.m) ?? ""}
                          onChange={(e) =>
                            setDur({ ...dur, [r.id]: { ...dur[r.id], m: e.target.value } })
                          }
                        />
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="action-buttons">
                      <button
                        className="btn"
                        disabled={!canReserve(r)}
                        onClick={() => handleReserve(r.id)}
                      >
                        Reserve
                      </button>
                      <button
                        className="btn"
                        disabled={r.reservedBy !== me && r.reservedBy !== "—"}
                        onClick={() => handleRelease(r.id)}
                      >
                        Release
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
