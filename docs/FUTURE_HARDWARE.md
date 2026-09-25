# Conceptual Hardware Specification: Robotic Physical Solver

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Status**: **FUTURE / OUT OF SCOPE FOR V1**

> [!IMPORTANT]
> **FUTURE / OUT OF SCOPE FOR V1**  
> This specification documents forward-looking architectural designs and communication protocols for an autonomous physical robotic solver rig planned for Cubyntra V4. **No physical robotics hardware or drivers are part of the Cubyntra V1 release.**

---

## 1. System Architecture Overview

The envisioned physical robotic solver consists of a 6-axis mechanical fixture clamping the six center caps of a standard $3 \times 3 \times 3$ Rubik's Cube, enabling simultaneous or sequential rotation of any face without manual human intervention.

```
+-------------------------------------------------------------+
|               Cubyntra Web Application                      |
| (Kociemba Two-Phase Solver -> Solution Move Sequence Array) |
+-------------------------------------------------------------+
                              │
                    Web Serial / Web Bluetooth
                              │
                              ▼
+-------------------------------------------------------------+
|                 ESP32 Master Microcontroller                |
|  - Real-time command buffer                                 |
|  - Kinematic S-curve acceleration profiling                 |
|  - Step/Dir pulse generation (FastAccelStepper)             |
+-------------------------------------------------------------+
                              │
                    Step & Direction Pulses
                              │
                              ▼
+-------------------------------------------------------------+
|           6x TMC2209 Silent Stepper Motor Drivers          |
+-------------------------------------------------------------+
                              │
                    Bipolar Stepper Currents
                              │
                              ▼
+-------------------------------------------------------------+
|               6x NEMA-17 Bipolar Stepper Motors             |
|       (Direct-Drive / Planetary Gear to 6 Face Grippers)    |
+-------------------------------------------------------------+
```

---

## 2. Microcontroller & Driver Hardware Architecture

### 2.1 Compute Unit: ESP32-S3
- **Dual-Core Xtensa LX7 @ 240 MHz**:
  - Core 0: High-speed Web Serial / BLE communications and command parsing.
  - Core 1: Hardware timer interrupts generating step pulses up to 100 kHz.
- **Onboard Flash**: 8 MB for offline move caching.

### 2.2 Motor Drivers: TMC2209
- **StealthChop2 / SpreadCycle**: Ultra-quiet operation and high torque output during rapid accelerations.
- **Microstepping**: 1/16 microstepping with interpolation to 1/256 for smooth positioning.
- **StallGuard4**: Sensorless stall detection used for automatic home calibration and physical jam detection.

---

## 3. Communication Protocol (Web Serial / BLE)

### 3.1 Packet Specification
Commands are transmitted as lightweight, deterministic JSON or binary packets over standard Web Serial at 115,200 baud.

#### JSON Representation:
```json
{
  "seq": 104,
  "cmd": "EXECUTE_SOLVE",
  "moves": [
    { "face": "R", "turns": 1, "speed_rpm": 450 },
    { "face": "U", "turns": -1, "speed_rpm": 450 },
    { "face": "F", "turns": 2, "speed_rpm": 600 }
  ]
}
```

#### Compact Binary Protocol (4 bytes per move):
```
[ Byte 0: Face ID ('U' = 0x01, 'D' = 0x02, 'F' = 0x03, 'B' = 0x04, 'L' = 0x05, 'R' = 0x06) ]
[ Byte 1: Rotation Direction (0x01 = +90°, 0xFF = -90°, 0x02 = 180°) ]
[ Byte 2: Acceleration Profile ID ]
[ Byte 3: CRC8 Checksum ]
```

---

## 4. Kinematics & Mechanical Safety Considerations

### 4.1 S-Curve Acceleration Profiling
Step motors undergoing instantaneous velocity changes induce mechanical shock, leading to piece popping or corner twisting:
- Jerk-limited third-order polynomial S-curve velocity profiles:
  $$j(t) = \frac{da(t)}{dt} = \text{constant}$$
- Maximum rotational velocity: 600 RPM ($100\text{ms}$ per $90^\circ$ turn).

### 4.2 Interlock & Collision Prevention
A physical Rubik's cube cannot execute perpendicular face turns simultaneously (e.g., `R` and `U` cannot rotate at the exact same instant without collision):
- The firmware scheduler enforces a minimum $15\text{ms}$ inter-move dwell time.
- Opposite face turns (e.g., `R` and `L`, or `U` and `D`) may be executed concurrently to optimize physical solve time.

### 4.3 Position Feedback & Error Recovery
Each stepper axis is equipped with an AS5600 12-bit magnetic rotary encoder on the output shaft:
- Confirms precise $\pm 0.5^\circ$ angular alignment at the completion of every move.
- In the event of a mechanical bind, motion halts instantly, reporting an emergency stop packet to the Cubyntra web client.
