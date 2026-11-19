# Cubyntra User Manual and Test Guide

Version 2.0.0 · November 2026 · Necookie Labs

This manual walks you through every feature of Cubyntra, the Rubik's Cube tutor. Each feature
has short steps, what you should see, and a box to tick, so you can use it both to learn the app
and to test it before the presentation.

## 0. Before you start

### 0.1 What you need

- A laptop with a webcam and Chrome or Edge.
- A standard 3x3 cube: white opposite yellow, green opposite blue, red opposite orange.
- Even, bright light. Glare on the stickers is the most common cause of misreads.
- Optional: a phone on the same Wi-Fi (or signed in to the hosted site), to use as the camera.

### 0.2 Ways to open the app

| Where | Address | When to use it |
|---|---|---|
| Laptop, production | `http://localhost:3001` | Everyday use and testing on the laptop. Light on memory. |
| Laptop, development | `https://localhost:3001` | Needed when a phone on the same Wi-Fi is the camera (phones need HTTPS). Start it with `npm run dev -- -p 3001`. |
| Hosted | `https://cubyntra.necookie.dev` | You and Kiko, from any device, after the Cloudflare setup is finished. Sign in with your email code. |

To start the laptop app yourself, open a terminal in the project folder and run
`npx next start -p 3001` (after `npm run build` if the code changed). Port 3000 is used by another
project on this laptop, so Cubyntra uses 3001.

### 0.3 Quick health check

| Check | How | Expected |
|---|---|---|
| The server answers | Open `/api/health` on your address | `{"ok":true,"mode":"local", ...}` (or `cloudflare-access` on the hosted site) |
| The coach is live | Settings → Coach | "Live", with "$0.00 of $10.00" or similar spent this month |
| Voice can use ElevenLabs | Settings → Voice | The ElevenLabs option is enabled and shows "x of 20,000" credits |

- [ ] All three checks pass

## 1. Home and choosing a method

### Test 1.1 First look

1. Open the app.
2. Look at Home.

Expected: "Let's solve your cube.", two method cards (Beginner's method and CFOP), **Scan my
cube**, **Try a demo cube**, a Progress glance and a More row (Trainer, Timer, Pair phone).

- [ ] Pass

### Test 1.2 The method choice is remembered

1. Click the **CFOP** card.
2. Reload the page.
3. Click **Beginner's method** again (use it for the first real solve).

Expected: the card you picked stays selected after the reload.

- [ ] Pass

## 2. Demo solve (no camera needed)

The demo cube is the quickest full tour of the solve screen and works without a camera.

### Test 2.1 Start a demo solve

1. On Home, click **Try a demo cube**.

Expected: the Solve screen opens with the stage header ("Beginner's method · Stage 1 of 8", a row
of stage blocks, the step number), the 3D twin, move chips, the coach panel and **I did it**.

- [ ] Pass

### Test 2.2 The twin and its controls

1. Press **Play**. Watch the cube turn and the arrows show each move.
2. Press **Pause**, then **step back** and **step forward** one move at a time.
3. Turn on **0.5×** and **Loop**, and play again.
4. Click any move chip.
5. Turn on **After** to see where the pieces end up.
6. Drag the cube to look around it; scroll to zoom.

Expected: each control does what it says. The "In words" line follows the current move ("Turn the
right side up"). The pieces this step is about stay in full color and the others are pale.

- [ ] Pass

### Test 2.3 Coach hints

1. In the coach panel, press **1 What to look for**.
2. Then **2 Why it works**.
3. Then **3 Show the moves**.

Expected: each answer streams in, gets more specific, and never names a move that isn't in this
step. Each hint is a real Claude call and costs a fraction of a cent. Without a key, or when the
monthly cap is reached, a "Templates" or "Cap reached" chip shows and the built-in notes answer
instead.

- [ ] Pass

### Test 2.4 Finish a step without a camera

1. Press **I did it**.
2. In the sheet, press **It matches**.

Expected: "Block placed", then the next step loads by itself after about two seconds (or press
**Next step**). Focus moves to the new step's heading.

- [ ] Pass

### Test 2.5 Finish a whole solve

1. Repeat Test 2.4 until the last step (about 20-27 steps for the beginner's method).

Expected: **Solved!** with **Solve another** and **Home**. Home's Progress glance now counts one
solve.

- [ ] Pass

## 3. Scanning your real cube

### Test 3.1 Scan all six faces

1. Scramble your cube.
2. On Home, click **Scan my cube** and allow the camera.
3. Follow the on-screen instructions for each face:
   1. **White** center: white on top, green facing you, then tip the top toward the camera.
   2. **Green**: tip it back so green faces you, white on top.
   3. **Red**: turn the whole cube a quarter to the left (white stays on top).
   4. **Blue**: another quarter turn to the left.
   5. **Orange**: another quarter turn to the left.
   6. **Yellow**: the last face; follow the hint.
4. Hold the cube a hand's length from the lens, face flat to the camera, fingers on the edges.
   Hold still; each face is captured by itself.

Expected: each face is captured and the next instruction appears. After six faces, the Review
screen shows all 54 stickers.

- [ ] Pass

### Test 3.2 Review and fix tiles

1. On Review, compare every tile with your cube. Red and orange are the usual mix-up.
2. Tap a wrong tile and pick the right color (or press 1-6).
3. Watch the count chips and the status line.
4. Press **Confirm & solve**.

Expected: **Confirm & solve** stays disabled until the colors make a real cube. After it, the
guided solve opens for the method chosen on Home.

- [ ] Pass

### Test 3.3 Start over asks first

1. Scan again until Review, then press **Start over**.

Expected: the app asks first, with "Keep this scan" focused. Keep it, or discard to rescan.

- [ ] Pass

### Test 3.4 Camera blocked

1. Block the camera in the browser (the camera icon in the address bar), then open Scan.

Expected: "The camera didn't open" with a plain reason, and **Try again**, **Use demo cube** and
**Back**. "Camera not working?" explains how to allow it.

- [ ] Pass

### Test 3.5 A cube that is already solved

1. Scan a solved cube.

Expected: "Your cube is already solved" (scramble it and scan again). It is not counted as a
solve.

- [ ] Pass

## 4. Solving your real cube with checkpoints

### Test 4.1 A step done right

1. Hold your cube the way the twin shows it.
2. Play the step, do the same moves on your cube.
3. Press **I did it**, read the sheet (the mini-cube marks which face to show and which edge goes
   at the top of the picture), show that face, press **Check this face**.

Expected: "Block placed" and the next step.

- [ ] Pass

### Test 4.2 "Show me again"

1. On a check, hold the face at an angle, half out of the square, or with a finger over a sticker.

Expected: "Show me ... again" with the unclear tiles marked. Tapping a tile lets you correct it.

- [ ] Pass

### Test 4.3 Wrong face

1. On a check, show a different face from the one asked for.

Expected: the sheet says which face to show instead.

- [ ] Pass

### Test 4.4 A deliberate mistake

1. On a step, do one move the wrong way on purpose (for example U' instead of U).
2. Press **I did it** and check the face.

Expected: the sheet closes and **Not quite yet** shows the most likely mistake in words ("you
turned the top the other way at move ..."), the read faces with wrong tiles marked, and the
coach's explanation. Options: **Replay the step**; **Show me how to fix it** or **Carry on from
here** (when the diagnosis is confident); **Show the ... face too** (when one more face would
settle it); **Rescan the cube**; **It actually matches**.

- [ ] Pass

### Test 4.5 Recover with "Show me how to fix it"

1. After Test 4.4, press **Show me how to fix it** and follow the corrective step.

Expected: the twin shows how to undo the slip, then the solve continues.

- [ ] Pass

### Test 4.6 Recover with a rescan

1. Make a mess on purpose, press **Rescan the cube** and scan all six faces.

Expected: the same stage is planned again from your cube as it is now; nothing restarts from
zero.

- [ ] Pass

### Test 4.7 Beginner's method flips

1. Follow the beginner's method through the first stages.

Expected: the daisy and white cross are done with yellow on top; the twin shows when to flip the
whole cube over (a whole-cube turn appears as a move chip).

- [ ] Pass

## 5. Voice

### Test 5.1 Choose a voice

1. Open **Settings → Voice**.
2. Choose **Device voice**, press **Test voice**.
3. Choose **ElevenLabs**, press **Test voice**.
4. Try **Speed** (Slow / Normal / Fast) and **Moves** (In words / As letters).

Expected: you hear each voice. The ElevenLabs credits meter shows "x of 20,000" this month and
the credits left.

- [ ] Pass

### Test 5.2 Voice during a solve

1. Start a solve (demo or real) and press the speaker button (**Voice**) in the coach panel.
2. Play a step.
3. Ask a hint.
4. Do a checkpoint.

Expected: the twin's moves are named as they turn, a new stage is introduced, the checkpoint
result is spoken, and the coach's reply is read with the device voice. In ElevenLabs mode,
**Read with ElevenLabs** reads the reply in the ElevenLabs voice. A new step stops whatever is
still being said.

- [ ] Pass

### Test 5.3 One speaker when paired

1. With a phone paired (Section 11), turn voice on and drive the solve from one device.

Expected: only that device speaks; the other shows "Your other device is speaking."

- [ ] Pass

## 6. Resume, discard and solve another

### Test 6.1 Reload mid-solve

1. In the middle of a solve, reload the page.

Expected: "Loading your cube", then the same step.

- [ ] Pass

### Test 6.2 Leave and come back

1. Go to Home through the menu, then back to Solve. Also try the browser's back and forward.

Expected: Home shows **Continue** with the method, step and stage; Solve returns to the same step
without planning again.

- [ ] Pass

### Test 6.3 Discard a solve

1. On Home, press **Discard this solve**.

Expected: it asks first, with "Keep it" focused. Discard clears the solve but keeps your stats,
mastery and streak.

- [ ] Pass

### Test 6.4 Solve another

1. Finish a solve, press **Solve another**, scan a new scramble.

Expected: a fresh solve starts with the method chosen on Home (not a continuation of the old one).

- [ ] Pass

## 7. Trainer

### Test 7.1 Drill a case

1. Open **Trainer** and pick a set (Beginner's algorithms, F2L, 2-look OLL and PLL, Full OLL, Full
   PLL). Optionally filter by group.
2. Follow the drill card: *Set it up* (do the setup moves on a solved cube), *Name it* (**Show
   the name**), *Solve it* (**Show the algorithm**, or **Ask the coach**), *Check it* (**Got it** /
   **Missed it**, or **Check with the camera**).

Expected: the twin shows the case with its pieces lit; the case grid updates; a missed case comes
back within two drills. The chosen set is remembered after a reload.

- [ ] Pass

### Test 7.2 Drill a chosen case

1. Tap a square in the case grid.

Expected: that case is drilled next.

- [ ] Pass

## 8. Timer

### Test 8.1 Time a solve

1. Open **Timer**. Scramble your cube with the scramble shown (white on top, green in front).
2. Tap the pad (or press Space) to start the 15-second inspection.
3. Hold until the pad turns green ("Let go to start"), let go to start the clock.
4. Solve, then tap (or press Space) to stop.

Expected: calls at 8 and 12 seconds; the time is saved under Recent solves; best single, ao5 and
ao12 update once there are enough solves. Escape cancels inspection.

- [ ] Pass

### Test 8.2 Penalties and history

1. Mark the last solve **+2**, then **DNF**, then **Delete** it.
2. Reload the page.

Expected: each change applies; the history survives the reload. Inspection past 15 s adds +2,
past 17 s is a DNF.

- [ ] Pass

## 9. Progress and graduation

### Test 9.1 Your world

1. After a few solves and drills, open **Progress**.

Expected: blocks placed, the streak (with a four-week calendar), cases learned, totals, and two
islands (Beginner's and CFOP) where each mastered stage is a full block.

- [ ] Pass

### Test 9.2 Graduation (takes longer)

1. A stage is mastered when 3 of its last 5 completions needed no "Show the moves" hint. Master
   every beginner's stage.

Expected: Home shows "Ready for CFOP" with **Switch to CFOP**. After mastering CFOP's 2-look
stages: "Ready for the full last layer".

- [ ] Pass (or skip for the presentation)

## 10. Settings

### Test 10.1 Every setting is saved

1. Change each in turn, reloading after each: **Name**, **method to start with**, **CFOP last
   layer** (2-look or Full OLL and PLL, shown while CFOP is chosen), **Moves in words**, **Letters
   on stickers**, **Theme** (Light / Dark / System), **Reduce motion**.

Expected: every change sticks after a reload. Letters appear on the twin's stickers; Reduce motion
makes the twin turn instantly; the theme switches without a flash.

- [ ] Pass

### Test 10.2 Coach and voice status

1. Look at the **Coach** and **Voice** sections.

Expected: the coach mode (Live, Templates only, Monthly cap reached or Offline) with money spent
this month; voice credits used this month.

- [ ] Pass

## 11. Phone as the camera

Phones need HTTPS for the camera: use the development server (`https://...:3001`) on the same
Wi-Fi, or the hosted site.

### Test 11.1 Pair with the QR code

1. On the laptop, open **Pair phone**.
2. Scan the QR code with the phone; accept the certificate warning if you're on the laptop's
   development server.

Expected: the status chip changes to phone connected. The pairing survives moving between pages.

- [ ] Pass

### Test 11.2 Pair with the typed code

1. On the phone, open the companion page and choose **Type a code**; enter the six characters.

Expected: it pairs. A wrong, used or expired code says "That code is not right, or it has
expired."

- [ ] Pass

### Test 11.3 Scan with the phone

1. On the laptop's Scan screen, choose **Scan with the phone** and scan the six faces on the
   phone.

Expected: the faces appear on the laptop; only colors are sent, never pictures. Review and solve
continue on the laptop.

- [ ] Pass

### Test 11.4 Rescan one face that read wrong

1. While scanning with the phone, if a face's colors on the laptop don't match your cube, press
   **Rescan** under that face on the laptop.
2. Or, on the phone, tap that face in the face strip and press **Scan this face again**.

Expected: the laptop clears just that face, the phone goes back to it, and the new reading replaces
the old one. The other faces stay as they were.

- [ ] Pass

### Test 11.5 Solve on the phone, mirror on the laptop

1. After a scan, on the phone press **Solve on this phone**.
2. Play, check a step on the phone.

Expected: the laptop follows the step, grip and playback; checkpoint results show on both.

- [ ] Pass

## 12. The hosted site (cubyntra.necookie.dev)

Do this after the Cloudflare tunnel and Access application are set up.

### Test 12.1 Only invited people get in

1. Open `https://cubyntra.necookie.dev` in a private window.
2. Enter an email that is not invited.
3. Enter your own email, then the code from your inbox.

Expected: the uninvited email gets no code; yours opens the app.

- [ ] Pass

### Test 12.2 Separate profiles for you and Kiko

1. You start a solve and change a setting. Kiko signs in on another device.

Expected: Kiko sees a fresh profile, not your solve or settings. Coach and voice spend share one
cap.

- [ ] Pass

### Test 12.3 Phone pairing on the hosted site

1. On the laptop, **Pair phone**; scan the QR code with the phone (sign in with the same email on
   the phone).

Expected: the QR code points at `https://cubyntra.necookie.dev/companion`, the phone pairs without
certificate warnings, and the camera works.

- [ ] Pass

## 13. Quick accessibility checks

| Check | Expected | Pass |
|---|---|---|
| Use only the keyboard (Tab, Enter, Space, Escape) on Home, Solve and Timer | Everything is reachable, focus is visible, dialogs close with Escape | [ ] |
| Turn on Letters on stickers | Every sticker shows its letter (W, Y, R, O, G, B) | [ ] |
| Turn on Reduce motion | The twin turns instantly, nothing bounces | [ ] |
| Dark theme | All text is readable | [ ] |

## 14. Troubleshooting

| Problem | What to do |
|---|---|
| The page doesn't load | Check the server window is open. Start it again with `npx next start -p 3001`. |
| "Port in use" on 3000 | Another project uses 3000. Cubyntra runs on 3001. |
| The camera doesn't start | Allow the camera in the address bar, close other apps using it, press Try again. Phones need HTTPS. |
| Colors read wrong | Brighter, even light; avoid glare; fix tiles on Review. |
| Coach shows "Templates" | No key, the monthly cap is reached, or no internet. The built-in notes still work. |
| No ElevenLabs voice | No key, the credit cap is reached, or ElevenLabs is down; the device voice takes over. |
| Hosted site asks for a code each time | Cloudflare Access session expired; sign in again with your email. |
| Laptop feels slow | Close other dev servers and browser tabs; Cubyntra's production server uses about 110 MB. |

## 15. Sign-off

| Area | Tests | Pass |
|---|---|---|
| Health check | 0.3 | [ ] |
| Home and method | 1.1-1.2 | [ ] |
| Demo solve | 2.1-2.5 | [ ] |
| Scan | 3.1-3.5 | [ ] |
| Real solve and checkpoints | 4.1-4.7 | [ ] |
| Voice | 5.1-5.3 | [ ] |
| Resume, discard, solve another | 6.1-6.4 | [ ] |
| Trainer | 7.1-7.2 | [ ] |
| Timer | 8.1-8.2 | [ ] |
| Progress | 9.1-9.2 | [ ] |
| Settings | 10.1-10.2 | [ ] |
| Phone | 11.1-11.5 | [ ] |
| Hosted site | 12.1-12.3 | [ ] |
| Accessibility | 13 | [ ] |

Tested by: ____________________ Date: ____________ Notes: ______________________________
