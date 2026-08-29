# Shape Defense

A shapes-only browser remake of the fortress tower-defense genre (inspired by
*Galaxy Defense: Fortress TD*). Everything on screen is a geometric primitive —
no sprites, no images, no dependencies.

## Play

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Works with mouse and touch (mobile-friendly).

## How to play

- Defend the hexagon **fortress** at the center. When its hull hits zero, the run ends.
- Tap a dashed **slot** in the ring to build a turret; tap a built turret to upgrade (3 levels) or sell.
- Kills and wave clears earn **energy** (the cyan diamonds) to spend on turrets.
- After each wave, pick one of three **system upgrade** cards — they stack for the whole run.
- Every 5th wave brings a **boss** that lays siege to the fortress.
- Waves are endless and keep scaling; your best score is saved locally.

### Turrets

| Turret | Shape | Role |
| --- | --- | --- |
| Blaster | triangle | rapid single-target fire |
| Cannon | square | slow splash damage |
| Frost | hexagon | slows nearby enemies |
| Laser | diamond | piercing beam |
| Missile | pentagon | homing shots that hunt the biggest threat |

### Enemies

| Enemy | Shape | Behavior |
| --- | --- | --- |
| Swarm | triangle | fast, weak, comes in numbers |
| Grunt | square | standard attacker |
| Tank | pentagon | slow and beefy |
| Splitter | hexagon | splits into swarm triangles on death |
| Boss | octagon | every 5th wave; sieges the fortress with damage pulses |

Keyboard shortcuts: `P`/`Esc` pause, `Space` starts the next wave early (+15 energy rush bonus).
