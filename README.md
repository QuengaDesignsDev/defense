# Shape Defense

A shapes-only browser remake of the fortress tower-defense genre (inspired by
*Galaxy Defense: Fortress TD*). Everything on screen is a geometric primitive —
no sprites, no images, no dependencies.

**Play it live:** https://defensive.quengadesigns.dev (Vercel fallback:
https://defensive-lovat.vercel.app)

It is an installable PWA: after one visit it works fully offline, and
"Add to Home Screen" gives a fullscreen standalone app on iOS and Android.

## Play locally

Open `index.html` in a browser, or serve the folder:

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

Works with mouse and touch (mobile-friendly).

## How to play

- Meteors and alien shapes rain from the sky toward your **base** at the bottom
  of the screen. When its hull (3200) hits zero, the run ends.
- Your **gunner auto-fires** glowing tracers at the lowest threat — you manage
  everything around him.
- Tap a dashed **ground socket** to build a turret; tap a built turret to
  upgrade (3 levels) or sell. Kills earn **energy** (cyan diamonds) to spend.
- Kills also grant **XP**. Each level-up pauses the fight to offer one of three
  **upgrade cards** (damage, fire rate, split fire, repair, hull, crit, and more)
  that stack for the run.
- Survive each **stage's timer**; stages scale endlessly. Every 5th stage a
  **boss** descends — a volley-firing siege boss, or a Carrier that releases
  swarms on the 10s. A **speed toggle** (x1/x2) keeps things moving.
- Each run awards **cores** (score ÷ 150). Spend them in the main menu on
  permanent upgrades — hull plating, damage amp, reactor, harvester — that
  apply to every future run.
- Two difficulties, toggled in the main menu: **Normal**, and **Elite**
  (enemies +50% HP and +40% damage, score and cores ×1.5).
- The **home screen** shows your besieged planet: pick a starting stage with
  the side arrows (unlocked by clearing stages; later starts grant bonus
  energy), and open the Upgrades shop or the Intel briefing from the tiles.

### Turrets

| Turret | Shape | Role |
| --- | --- | --- |
| Blaster | triangle | rapid single-target fire |
| Cannon | square | slow splash damage |
| Frost | hexagon | slows nearby enemies |
| Laser | diamond | piercing beam |
| Missile | pentagon | homing shots that hunt the biggest threat |
| Tesla | octagon | chain lightning that arcs between enemies |

### Enemies

| Enemy | Shape | Behavior |
| --- | --- | --- |
| Meteor | flaming heptagon | falls straight, heavy impact damage |
| Zigzag | orange triangle | fast, bounces side to side |
| Blob | red pentagon | drifts down with a wobble, hits hard |
| Splitter | yellow hexagon | breaks into shards partway down |
| Tank | purple pentagon | slow, huge, devastating on impact |
| Sniper | pink diamond | stops mid-air and fires at the base |
| Boss | red octagon | stages 5, 15, 25…; descends and fires volleys |
| Carrier | purple decagon | stages 10, 20, 30…; hovers, releasing zigzag swarms |

Keyboard shortcuts: `P`/`Esc` pause, `S` toggles game speed.
