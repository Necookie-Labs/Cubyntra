# Cube Domain Model & Coordinate Geometry

**Product**: Cubyntra  
**Organization**: Necookie Labs  
**Document Version**: 1.0  
**Status**: V1 Release  
**Last Updated**: 2026-09-26  

---

## 1. Domain Standards & Canonical Orientation

Cubyntra adopts standard international World Cube Association (WCA) and Singmaster notation standards.

### 1.1 Canonical Center Color Scheme (Western Standard)
In canonical orientation:
- **Up (U)**: White ($\text{Top}$)
- **Front (F)**: Green ($\text{Front}$)
- **Right (R)**: Red ($\text{Right}$)
- **Down (D)**: Yellow ($\text{Bottom}$)
- **Left (L)**: Orange ($\text{Left}$)
- **Back (B)**: Blue ($\text{Back}$)

Opposing pairs:
- White $\longleftrightarrow$ Yellow ($U \leftrightarrow D$)
- Green $\longleftrightarrow$ Blue ($F \leftrightarrow B$)
- Red $\longleftrightarrow$ Orange ($R \leftrightarrow L$)

---

## 2. 54-Facelet Layout & Indexing

Each face contains 9 stickers indexed row-major from 0 to 8:

```
             +---+---+---+
             | 0 | 1 | 2 |
             +---+---+---+
             | 3 | 4 | 5 |  UP (White)
             +---+---+---+
             | 6 | 7 | 8 |
 +---+---+---+---+---+---+---+---+---+---+---+---+
 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 | 0 | 1 | 2 |
 +---+---+---+---+---+---+---+---+---+---+---+---+
 | 3 | 4 | 5 | 3 | 4 | 5 | 3 | 4 | 5 | 3 | 4 | 5 |
 +---+---+---+---+---+---+---+---+---+---+---+---+
 | 6 | 7 | 8 | 6 | 7 | 8 | 6 | 7 | 8 | 6 | 7 | 8 |
   LEFT (Orange) FRONT (Green) RIGHT (Red)  BACK (Blue)
 +---+---+---+---+---+---+---+---+---+---+---+---+
             | 0 | 1 | 2 |
             +---+---+---+
             | 3 | 4 | 5 |  DOWN (Yellow)
             +---+---+---+
             | 6 | 7 | 8 |
             +---+---+---+
```

Sticker index `4` on every face is the fixed center piece:
- $U[4] = \text{'white'}$
- $R[4] = \text{'red'}$
- $F[4] = \text{'green'}$
- $D[4] = \text{'yellow'}$
- $L[4] = \text{'orange'}$
- $B[4] = \text{'blue'}$

---

## 3. 3D Cubie Coordinate System

The 3D digital twin models the cube as 27 discrete cubies positioned in a right-handed Cartesian coordinate system:

$$x, y, z \in \{-1, 0, 1\}$$

```
          +Y (Up)
           |
           |
           +----> +X (Right)
          /
         /
       +Z (Front)
```

- **+X**: Right face (Red)
- **-X**: Left face (Orange)
- **+Y**: Up face (White)
- **-Y**: Down face (Yellow)
- **+Z**: Front face (Green)
- **-Z**: Back face (Blue)

### Cubie Classification:
1. **Core Cubie (1 piece)**: $(0, 0, 0)$ — Internal structural core; no exterior stickers.
2. **Center Cubies (6 pieces)**: Exactly one coordinate has magnitude 1 (e.g. $(0, 1, 0) \to U$ center).
3. **Edge Cubies (12 pieces)**: Exactly two coordinates have magnitude 1 (e.g. $(0, 1, 1) \to UF$ edge).
4. **Corner Cubies (8 pieces)**: All three coordinates have magnitude 1 (e.g. $(1, 1, 1) \to UFR$ corner).

---

## 4. Facelet-to-Cubie Spatial Mapping

| Face | Coordinate Axis | Facelet Index | Cubie Coordinates $(x, y, z)$ |
| :---: | :---: | :---: | :---: |
| **U** | $+Y$ ($y = 1$) | $0 \dots 2$ (Row 0)<br>$3 \dots 5$ (Row 1)<br>$6 \dots 8$ (Row 2) | $(-1, 1, -1), (0, 1, -1), (1, 1, -1)$<br>$(-1, 1, 0), (0, 1, 0), (1, 1, 0)$<br>$(-1, 1, 1), (0, 1, 1), (1, 1, 1)$ |
| **D** | $-Y$ ($y = -1$) | $0 \dots 2$ (Row 0)<br>$3 \dots 5$ (Row 1)<br>$6 \dots 8$ (Row 2) | $(-1, -1, 1), (0, -1, 1), (1, -1, 1)$<br>$(-1, -1, 0), (0, -1, 0), (1, -1, 0)$<br>$(-1, -1, -1), (0, -1, -1), (1, -1, -1)$ |
| **F** | $+Z$ ($z = 1$) | $0 \dots 2$ (Row 0)<br>$3 \dots 5$ (Row 1)<br>$6 \dots 8$ (Row 2) | $(-1, 1, 1), (0, 1, 1), (1, 1, 1)$<br>$(-1, 0, 1), (0, 0, 1), (1, 0, 1)$<br>$(-1, -1, 1), (0, -1, 1), (1, -1, 1)$ |
| **B** | $-Z$ ($z = -1$) | $0 \dots 2$ (Row 0)<br>$3 \dots 5$ (Row 1)<br>$6 \dots 8$ (Row 2) | $(1, 1, -1), (0, 1, -1), (-1, 1, -1)$<br>$(1, 0, -1), (0, 0, -1), (-1, 0, -1)$<br>$(1, -1, -1), (0, -1, -1), (-1, -1, -1)$ |
| **R** | $+X$ ($x = 1$) | $0 \dots 2$ (Row 0)<br>$3 \dots 5$ (Row 1)<br>$6 \dots 8$ (Row 2) | $(1, 1, 1), (1, 1, 0), (1, 1, -1)$<br>$(1, 0, 1), (1, 0, 0), (1, 0, -1)$<br>$(1, -1, 1), (1, -1, 0), (1, -1, -1)$ |
| **L** | $-X$ ($x = -1$) | $0 \dots 2$ (Row 0)<br>$3 \dots 5$ (Row 1)<br>$6 \dots 8$ (Row 2) | $(-1, 1, -1), (-1, 1, 0), (-1, 1, 1)$<br>$(-1, 0, -1), (-1, 0, 0), (-1, 0, 1)$<br>$(-1, -1, -1), (-1, -1, 0), (-1, -1, 1)$ |

---

## 5. Face Rotation Permutations

When a face rotates 90° Clockwise (CW), two transformations occur simultaneously:
1. **The 3x3 face matrix rotates 90° CW**:
   $$\begin{bmatrix} 0 & 1 & 2 \\ 3 & 4 & 5 \\ 6 & 7 & 8 \end{bmatrix} \longrightarrow \begin{bmatrix} 6 & 3 & 0 \\ 7 & 4 & 1 \\ 8 & 5 & 2 \end{bmatrix}$$
2. **The 4 adjacent face strips cycle 3 stickers each**:

### Example: U Turn (Clockwise around $+Y$)
- $F[0, 1, 2] \longrightarrow L[0, 1, 2]$
- $L[0, 1, 2] \longrightarrow B[0, 1, 2]$
- $B[0, 1, 2] \longrightarrow R[0, 1, 2]$
- $R[0, 1, 2] \longrightarrow F[0, 1, 2]$

### Example: R Turn (Clockwise around $+X$)
- $U[2, 5, 8] \longrightarrow B[6, 3, 0]$ (reversed)
- $B[6, 3, 0] \longrightarrow D[2, 5, 8]$
- $D[2, 5, 8] \longrightarrow F[2, 5, 8]$
- $F[2, 5, 8] \longrightarrow U[2, 5, 8]$

---

## 6. Mathematical Invariants & Verification

The Rubik's Cube group has order:

$$|G| = \frac{8! \times 3^8 \times 12! \times 2^{12}}{2 \times 3 \times 2} = 43,252,003,274,489,856,000$$

Cubyntra validates all three invariant constraints:
1. **Corner Orientation Parity**: Each corner has a twist in $\{0, 1, 2\}$. The total twist must sum to zero mod 3:
   $$\sum_{i=1}^8 \text{twist}_i \equiv 0 \pmod 3$$
2. **Edge Orientation Parity**: Each edge has a flip in $\{0, 1\}$. The total flips must sum to zero mod 2:
   $$\sum_{i=1}^{12} \text{flip}_i \equiv 0 \pmod 2$$
3. **Permutation Parity**: The permutation sign of the 8 corners must match the permutation sign of the 12 edges:
   $$\text{sgn}(\sigma_{\text{corners}}) = \text{sgn}(\sigma_{\text{edges}})$$

Any state violating these invariants is physically unsolvable without disassembly.
