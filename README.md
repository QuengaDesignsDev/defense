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
  everything through cards.
- Kills grant **XP**. Each level-up pauses the fight to offer one of three
  **cards**: deploy a turret onto a ground socket, upgrade a built turret
  (3 levels), or take a perk (damage, fire rate, split fire, repair, hull,
  crit, XP, and more). One free **refresh** per level-up rerolls the offer,
  and a tray shows everything acquired this run.
- **Turret combos**: build a turret and hold its required cards and the combo
  activates on its own — Flame Bullet, Shrapnel, Permafrost, Gamma Beam,
  Seeker Crits, Ion Storm. The COMBOS button on the level-up screen lists
  every recipe.
- Survive each **stage's timer**; stages scale endlessly. Every 5th stage a
  **boss** descends — a volley-firing siege boss, or a Carrier that releases
  swarms on the 10s. A **speed toggle** (x1/x2) keeps things moving. Starting
  at a later stage (unlocked by clearing) grants instant level-ups.
- Each run awards **cores** (score ÷ 150). Spend them in the main menu on
  permanent upgrades — hull plating, damage amp, reactor, harvester — that
  apply to every future run.
- Two difficulties, toggled in the main menu: **Normal**, and **Elite**
  (enemies +50% HP and +40% damage, score and cores ×1.5).
- The **home screen** shows your besieged planet: pick a starting stage with
  the side arrows (unlocked by clearing stages; later starts grant bonus
  energy), and open the Turret Lab or Upgrades shop from the tiles.
- The **Turret Lab**: every turret has a persistent level (1–10) upgraded with
  cores. Each level gives that turret +8% damage and +2% global crit damage,
  with milestones at Lv3/5/7/10 (range, fire rate, special effect, damage) —
  and Lv2/Lv5 unlock that turret's **signature battle cards** (star-tier
  cards like Double Tap, Napalm, Split Beam, Superconductor) that join the
  level-up card pool when the turret is built. Turrets themselves unlock by
  clearing stages: Frost at 2, Laser at 4, Missile at 6, Tesla at 8.

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
