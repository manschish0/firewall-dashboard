import { useEffect, useState, useMemo, useRef } from "react";

const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:5001";
const API = `${API_BASE}/api`;

export default function App() {
  const [rows, setRows] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState(""); // your name for reservations
  const [dur, setDur] = useState({}); // deviceId -> {d,h,m}
  const [activeTab, setActiveTab] = useState("Development"); // Default to Development
  const scrollPositionRef = useRef(0);
  
  // Admin state
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null); // {id, deviceIp, consoleIp, consolePort}
  const [showAddDeviceModal, setShowAddDeviceModal] = useState(false);
  const [newDevice, setNewDevice] = useState({
    name: "",
    device_ip: "",
    console_ip: "",
    console_port: 23,
    team: "Development",
    section: "",
    enable_ping: 1
  });

  const refresh = async (showLoading = false) => {
    // Save current scroll position before refresh
    scrollPositionRef.current = window.scrollY || window.pageYOffset;
    if (showLoading) {
      setLoading(true);
    }
    const [devicesRes, inventoryRes] = await Promise.all([
      fetch(`${API}/devices`),
      fetch(`${API}/inventory`)
    ]);
    const devicesData = await devicesRes.json();
    const inventoryData = await inventoryRes.json();
    setRows(devicesData);
    setInventory(inventoryData);
    if (showLoading) {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial load with loading state
    refresh(true);
    // Auto-refresh without loading state to prevent flicker
    const t = setInterval(() => refresh(false), 5001);
    return () => clearInterval(t);
  }, []);

  // Restore scroll position after data loads
  useEffect(() => {
    if (!loading && scrollPositionRef.current > 0) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        window.scrollTo(0, scrollPositionRef.current);
      });
    }
  }, [loading, rows]);

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
    await refresh(false);
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
    await refresh(false);
  };

  // Admin functions
  const handleAdminVerify = async () => {
    const res = await fetch(`${API}/admin/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: adminCode })
    });
    const data = await res.json();
    if (res.ok) {
      setIsAdmin(true);
      setShowAdminModal(false);
      setAdminCode("");
    } else {
      alert(data.error || "Invalid admin code");
    }
  };

  const handleEditDevice = (device) => {
    // Parse console_ip and console_port from telnet string
    let consoleIp = "";
    let consolePort = 23;
    if (device.telnet && device.telnet !== "—" && device.telnet.trim() !== "") {
      // Match format: "IP PORT" (without "telnet" prefix)
      const match = device.telnet.match(/^([^\s]+)\s+(\d+)$/);
      if (match) {
        consoleIp = match[1];
        consolePort = parseInt(match[2], 10);
      }
    }
    setEditingDevice({
      id: device.id,
      name: device.name || "",
      deviceIp: device.deviceIp === "—" ? "" : (device.deviceIp || ""),
      consoleIp: consoleIp,
      consolePort: consolePort || 23
    });
  };

  const handleSaveDevice = async () => {
    if (!editingDevice) return;
    
    if (!editingDevice.name || !editingDevice.name.trim()) {
      alert("Device name is required");
      return;
    }
    
    const res = await fetch(`${API}/devices/${editingDevice.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editingDevice.name.trim(),
        device_ip: editingDevice.deviceIp,
        console_ip: editingDevice.consoleIp,
        console_port: editingDevice.consolePort === "" ? 23 : (editingDevice.consolePort || 23)
      })
    });
    
    if (!res.ok) {
      const e = await res.json();
      alert(e.error || "Failed to update device");
    } else {
      setEditingDevice(null);
      await refresh(false);
    }
  };

  const handleDeleteDevice = async (id) => {
    if (!window.confirm("Are you sure you want to delete this device?")) {
      return;
    }
    
    const res = await fetch(`${API}/devices/${id}`, {
      method: "DELETE"
    });
    
    if (!res.ok) {
      const e = await res.json();
      alert(e.error || "Failed to delete device");
    } else {
      await refresh(false);
    }
  };

  const handleAddDevice = async () => {
    if (!newDevice.name.trim()) {
      alert("Device name is required");
      return;
    }
    
    const res = await fetch(`${API}/devices`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newDevice,
        console_port: newDevice.console_port === "" ? 23 : (newDevice.console_port || 23)
      })
    });
    
    if (!res.ok) {
      const e = await res.json();
      alert(e.error || "Failed to add device");
    } else {
      setShowAddDeviceModal(false);
      setNewDevice({
        name: "",
        device_ip: "",
        console_ip: "",
        console_port: 23,
        team: "Development",
        section: "",
        enable_ping: 1
      });
      await refresh(false);
    }
  };

  const AvailabilityBadge = ({ r }) => {
    if (r.availability === "Available")
      return <span className="badge badge-available">Available</span>;
    if (r.availability === "In Use")
      return <span className="badge badge-inuse">In Use</span>;
    return <span className="badge badge-na">Not Available</span>;
  };

  const DeviceTooltip = ({ device }) => {
    // Always render tooltip, show message if no data
    const hasData = device.owner || device.location;
    if (!hasData) {
      // Don't show tooltip if no data
      return null;
    }
    return (
      <div className="device-tooltip">
        {device.owner && (
          <div className="tooltip-row">
            <span className="tooltip-label">Owner:</span>
            <span className="tooltip-value">{device.owner}</span>
          </div>
        )}
        {device.location && (
          <div className="tooltip-row">
            <span className="tooltip-label">Location:</span>
            <span className="tooltip-value">{device.location}</span>
          </div>
        )}
      </div>
    );
  };

  // Group devices by team and then by section
  const groupedDevices = useMemo(() => {
    const groups = {
      QA: { manual: [], regression: [] },
      Development: { PRISM: [], HiSecOS: [] }
    };
    rows.forEach((r) => {
      const team = (r.team || "Development").trim();
      const section = (r.section || "").trim().toLowerCase();
      
      if (team.toLowerCase() === "qa") {
        if (section === "manual") {
          groups.QA.manual.push(r);
        } else if (section === "regression") {
          groups.QA.regression.push(r);
        } else {
          // Default to manual if section is not specified
          groups.QA.manual.push(r);
        }
      } else {
        // Development team
        // Get original section value and normalized version
        const originalSection = (r.section || "").trim();
        const normalizedSection = originalSection.replace(/\s+/g, "").toLowerCase();
        
        // Check for HiSecOS (handle various case/spacing variations like "HiSecOS", "hisecos", "HiSec OS", etc.)
        // Check both normalized and original to catch "HiSecOS" exactly
        if (normalizedSection === "hisecos" || 
            normalizedSection.includes("hisec") ||
            originalSection === "HiSecOS" ||
            originalSection.toLowerCase() === "hisecos") {
          groups.Development.HiSecOS.push(r);
        } else if (normalizedSection === "prism" || originalSection === "PRISM") {
          groups.Development.PRISM.push(r);
        } else {
          // Default to PRISM if section is not specified or doesn't match
          groups.Development.PRISM.push(r);
        }
      }
    });
    return groups;
  }, [rows]);

  // Calculate device status statistics per device type
  const deviceStatsByType = useMemo(() => {
    const statsByType = {};
    
    rows.forEach((r) => {
      const deviceName = r.name || "Unknown";
      
      if (!statsByType[deviceName]) {
        statsByType[deviceName] = {
          name: deviceName,
          total: 0,
          available: 0,
          inUse: 0,
          notAvailable: 0
        };
      }
      
      statsByType[deviceName].total++;
      
      if (r.availability === "Available") {
        statsByType[deviceName].available++;
      } else if (r.availability === "In Use") {
        statsByType[deviceName].inUse++;
      } else if (r.availability === "Not Available") {
        statsByType[deviceName].notAvailable++;
      }
    });
    
    // Convert to array and sort by device name
    return Object.values(statsByType).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);


  const renderTable = (deviceRows) => (
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
        {deviceRows.map((r) => (
          <tr key={r.id}>
            <td className="device-name-cell">
              {isAdmin && editingDevice?.id === r.id ? (
                <input
                  className="input-edit"
                  type="text"
                  value={editingDevice.name || ""}
                  onChange={(e) =>
                    setEditingDevice({ ...editingDevice, name: e.target.value })
                  }
                  placeholder="Device Name"
                  autoFocus
                />
              ) : (
                <>
                  <span className="device-name">{r.name}</span>
                  <DeviceTooltip device={r} />
                </>
              )}
            </td>
            {/* <td className={r.status === "Up" ? "status-up" : "status-down"}>
              {r.status}
            </td> */}
            <td>
              {isAdmin && editingDevice?.id === r.id ? (
                <input
                  className="input-edit"
                  type="text"
                  value={editingDevice.deviceIp || ""}
                  onChange={(e) =>
                    setEditingDevice({ ...editingDevice, deviceIp: e.target.value })
                  }
                  placeholder="IP Address"
                />
              ) : (
                <span>{r.deviceIp}</span>
              )}
            </td>
            <td>
              {isAdmin && editingDevice?.id === r.id ? (
                <div className="telnet-edit">
                  <input
                    className="input-edit"
                    type="text"
                    value={editingDevice.consoleIp || ""}
                    onChange={(e) =>
                      setEditingDevice({ ...editingDevice, consoleIp: e.target.value })
                    }
                    placeholder="Console IP"
                    style={{ width: "55%", flexShrink: 0 }}
                  />
                  <input
                    className="input-edit"
                    type="number"
                    min="1"
                    max="65535"
                    value={editingDevice.consolePort ?? 23}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setEditingDevice({ ...editingDevice, consolePort: "" });
                      } else {
                        const num = parseInt(val, 10);
                        if (!isNaN(num)) {
                          setEditingDevice({ ...editingDevice, consolePort: num });
                        }
                      }
                    }}
                    placeholder="Port"
                    style={{ width: "40%", flexShrink: 0 }}
                  />
                </div>
              ) : (
                <code>{r.telnet}</code>
              )}
            </td>
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
                <span style={{ color: '#7c8ba1' }}>—</span>
              )}
            </td>
            <td>
              <div className="action-buttons">
                {isAdmin && editingDevice?.id === r.id ? (
                  <>
                    <button
                      className="btn btn-save"
                      onClick={handleSaveDevice}
                    >
                      Save
                    </button>
                    <button
                      className="btn"
                      onClick={() => setEditingDevice(null)}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
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
                    {isAdmin && (
                      <button
                        className="btn btn-edit"
                        onClick={() => handleEditDevice(r)}
                      >
                        Edit
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        className="btn btn-delete"
                        onClick={() => handleDeleteDevice(r.id)}
                      >
                        Delete
                      </button>
                    )}
                  </>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

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
          {!isAdmin ? (
            <button
              className="btn btn-admin"
              onClick={() => setShowAdminModal(true)}
            >
              Enable Admin Settings
            </button>
          ) : (
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <span className="badge badge-admin">Admin Mode</span>
              <button
                className="btn btn-admin"
                onClick={() => {
                  setIsAdmin(false);
                  setEditingDevice(null);
                }}
              >
                Disable Admin
              </button>
              <button
                className="btn btn-add"
                onClick={() => setShowAddDeviceModal(true)}
              >
                + Add Device
              </button>
            </div>
          )}
          <span className="small">Auto-refreshing every 5s</span>
        </div>

        {/* Team Tabs */}
        <div className="tabs-container">
          <button
            className={`tab ${activeTab === "Development" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("Development")}
          >
            Development
          </button>
          <button
            className={`tab ${activeTab === "QA" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("QA")}
          >
            QA
          </button>
          <button
            className={`tab ${activeTab === "Inventory" ? "tab-active" : ""}`}
            onClick={() => setActiveTab("Inventory")}
          >
            Inventory
          </button>
        </div>

        {loading ? (
          <div>Loading…</div>
        ) : (
          <>
            {/* Development Team Section */}
            {activeTab === "Development" && (groupedDevices.Development.PRISM.length > 0 || groupedDevices.Development.HiSecOS.length > 0) && (
              <div className="team-section">
                <h2 className="team-header">Development Team</h2>
                
                {/* PRISM Subsection */}
                {groupedDevices.Development.PRISM.length > 0 && (
                  <div className="subsection">
                    <h3 className="subsection-header">PRISM</h3>
                    {renderTable(groupedDevices.Development.PRISM)}
                  </div>
                )}

                {/* HiSecOS Subsection */}
                {groupedDevices.Development.HiSecOS.length > 0 && (
                  <div className="subsection">
                    <h3 className="subsection-header">HiSecOS</h3>
                    {renderTable(groupedDevices.Development.HiSecOS)}
                  </div>
                )}
              </div>
            )}

            {/* QA Team Section */}
            {activeTab === "QA" && (groupedDevices.QA.manual.length > 0 || groupedDevices.QA.regression.length > 0) && (
              <div className="team-section">
                <h2 className="team-header">QA Team</h2>
                
                {/* Manual Subsection */}
                {groupedDevices.QA.manual.length > 0 && (
                  <div className="subsection">
                    <h3 className="subsection-header">Manual</h3>
                    {renderTable(groupedDevices.QA.manual)}
                  </div>
                )}

                {/* Regression Subsection */}
                {groupedDevices.QA.regression.length > 0 && (
                  <div className="subsection">
                    <h3 className="subsection-header">Regression</h3>
                    {renderTable(groupedDevices.QA.regression)}
                  </div>
                )}
              </div>
            )}

            {/* Inventory Tab */}
            {activeTab === "Inventory" && (
              <div className="team-section">
                <h2 className="team-header">Device Inventory</h2>
                
                {/* Device Status Summary by Type */}
                <div className="status-summary-table-container">
                  <table className="status-summary-table">
                    <thead>
                      <tr>
                        <th>Device Type</th>
                        <th>Total</th>
                        <th>Available</th>
                        <th>In Use</th>
                        <th>Not Available</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deviceStatsByType.length > 0 ? (
                        deviceStatsByType.map((stat) => (
                          <tr key={stat.name}>
                            <td className="device-type-cell">{stat.name}</td>
                            <td className="count-cell">{stat.total}</td>
                            <td className="count-cell count-available">{stat.available}</td>
                            <td className="count-cell count-inuse">{stat.inUse}</td>
                            <td className="count-cell count-na">{stat.notAvailable}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="5" className="no-devices-message">No devices found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <h3 className="subsection-header" style={{ marginTop: "32px", marginBottom: "12px" }}>Unmounted Inventory</h3>
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Device Name</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventory.length > 0 ? (
                      inventory.map((item) => (
                        <tr key={item.device_name}>
                          <td>{item.device_name}</td>
                          <td className="count-cell">{item.count}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="2" className="no-devices-message">No devices in inventory</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Show message if no devices in selected tab */}
            {activeTab === "Development" && groupedDevices.Development.PRISM.length === 0 && groupedDevices.Development.HiSecOS.length === 0 && (
              <div className="no-devices-message">No Development devices available</div>
            )}
            {activeTab === "QA" && groupedDevices.QA.manual.length === 0 && groupedDevices.QA.regression.length === 0 && (
              <div className="no-devices-message">No QA devices available</div>
            )}
          </>
        )}

        {/* Admin Code Modal */}
        {showAdminModal && (
          <div className="modal-overlay" onClick={() => setShowAdminModal(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h2>Enable Admin Settings</h2>
              <p>Enter admin code to enable admin features:</p>
              <input
                className="name-input"
                type="password"
                value={adminCode}
                placeholder="Enter admin code"
                onChange={(e) => setAdminCode(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleAdminVerify()}
                autoFocus
              />
              <div className="modal-actions">
                <button className="btn" onClick={handleAdminVerify}>
                  Verify
                </button>
                <button className="btn" onClick={() => {
                  setShowAdminModal(false);
                  setAdminCode("");
                }}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Device Modal */}
        {showAddDeviceModal && (
          <div className="modal-overlay" onClick={() => setShowAddDeviceModal(false)}>
            <div className="modal-content modal-large" onClick={(e) => e.stopPropagation()}>
              <h2>Add New Device</h2>
              <div className="form-group">
                <label>Device Name *</label>
                <input
                  className="name-input"
                  type="text"
                  value={newDevice.name}
                  placeholder="Device name"
                  onChange={(e) => setNewDevice({ ...newDevice, name: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Device IP</label>
                <input
                  className="name-input"
                  type="text"
                  value={newDevice.device_ip}
                  placeholder="Device IP address"
                  onChange={(e) => setNewDevice({ ...newDevice, device_ip: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Console IP</label>
                <input
                  className="name-input"
                  type="text"
                  value={newDevice.console_ip}
                  placeholder="Console IP address"
                  onChange={(e) => setNewDevice({ ...newDevice, console_ip: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Console Port</label>
                <input
                  className="name-input"
                  type="number"
                  min="1"
                  max="65535"
                  value={newDevice.console_port}
                  placeholder="Console port (default: 23)"
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "") {
                      setNewDevice({ ...newDevice, console_port: "" });
                    } else {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) {
                        setNewDevice({ ...newDevice, console_port: num });
                      }
                    }
                  }}
                />
              </div>
              <div className="form-group">
                <label>Team</label>
                <select
                  className="name-input"
                  value={newDevice.team}
                  onChange={(e) => setNewDevice({ ...newDevice, team: e.target.value })}
                >
                  <option value="Development">Development</option>
                  <option value="QA">QA</option>
                </select>
              </div>
              <div className="form-group">
                <label>Section</label>
                <input
                  className="name-input"
                  type="text"
                  value={newDevice.section}
                  placeholder="Section (e.g., PRISM, HiSecOS, manual, regression)"
                  onChange={(e) => setNewDevice({ ...newDevice, section: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>
                  <input
                    type="checkbox"
                    checked={newDevice.enable_ping === 1}
                    onChange={(e) => setNewDevice({ ...newDevice, enable_ping: e.target.checked ? 1 : 0 })}
                  />
                  Enable Ping
                </label>
              </div>
              <div className="modal-actions">
                <button className="btn btn-add" onClick={handleAddDevice}>
                  Add Device
                </button>
                <button className="btn" onClick={() => setShowAddDeviceModal(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
