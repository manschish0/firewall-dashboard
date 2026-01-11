## Initial Firewall Lab Dashboard Implementation

A full-stack application for managing **firewall device reservations**.

---

### Frontend (React)

- Device table displaying:
  - IP address
  - Telnet details
  - Availability status
- Reserve devices for **custom durations** (days / hours / minutes)
- Release active reservations
- Auto-refresh every **5 seconds**
- Availability badges:
  - Available  
  - In Use  
  - Not Available  

---

### Backend (Express + SQLite)

- REST APIs:
  - `GET /api/devices`
  - `POST /api/reserve`
  - `POST /api/release`
- Periodic **ping check (cron job)** to determine device availability
- Ability to **disable ping per device** (device always treated as available)
- Reservation system with **time-based expiration**

---

### Database Schema

- **devices**
  - name
  - IP addresses
  - console port
  - `enable_ping` flag
- **reservations**
  - user
  - device
  - start time
  - end time
- **device_status**
  - ping status
  - last checked timestamp
