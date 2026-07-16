# arcade-waypoints

A MakeCode Arcade extension that turns colour-coded tilemap markers into an ordered list of race track waypoints, and helps you drive AI-controlled sprites around it with the same left/right/accelerate/brake controls as a player.

## The idea

In a top-down driving game, you can mark out a track by painting coloured tiles along its centre line in the tilemap editor:

* Exactly **one** tile of a "start" colour (e.g. purple) - this is the start/finish line.
* One or more tiles of a second colour (e.g. blue) for the next stretch of track.
* One or more tiles of a third colour (e.g. red), then a fourth (e.g. yellow), and so on, for as many colour bands as your track needs.

This extension scans a tilemap for those tiles, and orders each colour's tiles using a nearest-neighbor search (starting from wherever the previous colour left off), so the tiles come out in the order a car should drive over them - even though the tilemap itself stores them in no particular order.

The result is a `waypoints.WaypointList` - an ordered list of waypoints, plus everything needed to drive one or more sprites around it: register a sprite to follow the list, and the extension automatically tracks which waypoint it's currently headed towards (advancing to the next one as it gets close, looping back to the start every lap). `plan_turn`/`plan_accel` then tell you which way to steer and whether to accelerate or brake, so you can feed the same controls into your existing player-driving code.

## Marking your track

1. Paint your track's centre line with 4 (or more) different single-purpose tiles, one colour per band of the track, in the order the track should be driven.
2. Make sure there is only **one** tile of the first colour - it's used as the unique start/finish line. The game will stop with an error if it finds more than one.
3. Build the ordered list of those tile colours - the `create list with` block is expandable, so add as many colours as your track needs with the `+` button.
4. Pass your tilemap (as a `tilemap` block) and that list to `waypoints on tilemap ... with tile colours ...`.

### Keeping the marker tiles out of your real level

Marker tiles are usually ugly - you don't want bright purple/blue/red/yellow squares showing up in your actual level. Since `buildTrack` just scans whatever `tiles.TileMapData` you hand it (it never sets it as the active tilemap), you can instead:

1. Duplicate your level's tilemap asset in the tilemap editor (e.g. `level` -> `level_waypoints`).
2. Paint the marker tiles onto the duplicate only, leaving your real `level` tilemap untouched.
3. Call `buildTrack` with the duplicate (`level_waypoints`), but keep setting the real `level` as your actual active/rendered tilemap during gameplay.

The duplicate only needs to match your real level in width, height, and tile scale (so each waypoint's grid position lines up) - it's never rendered or set as the current tilemap, so it doesn't matter that it's covered in bright marker tiles. All of the driving blocks (`distanceTo`, `angleTo`, `follow`, `planTurn`, `planAccel`, `debugShowWaypoints`) work purely off pixel positions and the currently active tilemap, so they don't care that the waypoints came from a different `TileMapData` object.

```blocks
let waypointList: waypoints.WaypointList = null
waypointList = waypoints.buildTrack(tilemap`level`, [
    assets.tile`start`,
    assets.tile`checkpoint1`,
    assets.tile`checkpoint2`,
    assets.tile`checkpoint3`
])
```

## Driving a sprite around the track

Register a sprite to follow the list with `make ... follow ... with threshold ... px`. From then on, the extension tracks which waypoint that sprite is headed towards on its own, advancing (and looping) automatically as the sprite gets within the threshold distance of its target. Call `plan turn`/`plan accel` every frame (e.g. from `game.onUpdate`) to get -1/0/+1 signals you can feed into the same physics you use for the player:

```blocks
let waypointList: waypoints.WaypointList = null
let car: Sprite = null

waypointList = waypoints.buildTrack(tilemap`level`, [assets.tile`start`, assets.tile`checkpoint1`])
waypoints.follow(waypointList, car, 8)

game.onUpdate(function () {
    const turn = waypoints.planTurn(waypointList, car, 0.2)
    const accel = waypoints.planAccel(waypointList, car, 0.6)
    // feed turn (-1 left, 0 straight, +1 right) and accel (-1 brake, +1 accelerate)
    // into the same code that handles the player's left/right/accel/brake
})
```

If you'd rather manage the current waypoint yourself, `waypoints.currentWaypoint(list, sprite)` returns the sprite's current target directly, and `waypoints.distanceTo`/`waypoints.angleTo` give you the raw distance/angle from a sprite to any tile location (also handy for your own custom driving logic).

### Running multiple racers on one track

Because progress is tracked per sprite, several sprites can follow the same `WaypointList` at once, each at its own point on the track - just call `waypoints.follow` once per sprite.

### Reacting to waypoints being reached

```blocks
let waypointList: waypoints.WaypointList = null
waypoints.onWaypointReached(waypointList, function (sprite, index) {
    // runs whenever any following sprite advances to a new waypoint
})
```

## Debugging: highlighting waypoints on the tilemap

While you're tuning things, `show prev/current/next waypoints` lets you watch a sprite's progress directly on the tilemap - it recolours the previous, current, and next waypoint tiles, and automatically restores each tile back to its original marker colour once it's no longer prev/current/next:

```blocks
let waypointList: waypoints.WaypointList = null
let car: Sprite = null
waypoints.debugShowWaypoints(waypointList, car, assets.tile`debugPrev`, assets.tile`debugCur`, assets.tile`debugNext`)
```

Leave any of the three tile images empty to skip highlighting that role. Call `waypoints.debugHideWaypoints(list, sprite)` to turn it back off and restore the tiles.

Debug highlighting always paints onto the tilemap that's currently active in the scene (not necessarily the one you passed to `buildTrack`), and it remembers whatever tile was really there before highlighting it, so it reverts correctly - including when you're using the separate-tilemap-for-authoring pattern above.

## Notes and limitations

* If the first colour marks more than one tile, the game stops with an error (`control.fail`) - fix your tilemap so that colour only marks a single start/finish tile.
* If the first colour marks no tiles at all, the resulting list is empty (logged as a warning, not a fatal error).
* Within a colour band, tiles are chained together by proximity only (nearest neighbor), so avoid looping a single colour band back near itself, or the search may take a shortcut across the loop instead of following the intended path.
* The tilemap you pass to `buildTrack` doesn't need to be the one currently active/rendered in the scene - it can be a separate, never-shown copy of your level with marker tiles painted on it (see "Keeping the marker tiles out of your real level" above). It just needs to match your real level's width, height, and tile scale, so each waypoint's grid position lines up correctly.
* Waypoint ordering (inside `buildTrack`) is computed from the tilemap's column/row grid, so it works correctly regardless of which tilemap is active in the scene at the time. `distanceTo`/`angleTo`/`follow`/`planTurn`/`planAccel`/`debugShowWaypoints`, however, compare/act on pixel positions and the currently active tilemap (`sprite.x`/`.y`, `location.x`/`.y`, and `tiles.setTileAt`), which are only meaningful once your real level's tilemap has actually been set as current - the normal case during gameplay, but worth knowing if you call these before that happens.
* `planTurn`'s sign convention: a positive angle difference (target is clockwise of the sprite's heading) returns `+1` (turn right); flip the sign in your own code if that doesn't match your player's controls.
* If a sprite isn't currently registered with `waypoints.follow`, `planTurn`/`planAccel` log a warning and return `0`.

## API

### waypoints.buildTrack(tilemap: tiles.TileMapData, tileColours: Image[]): waypoints.WaypointList

Scan the given tilemap for the given sequence of marker tile colours and return them as an ordered waypoint list. The first colour must mark exactly one tile (the start/finish line); every colour after that can mark one or more tiles.

### waypoints.waypointAt(list: waypoints.WaypointList, index: number): tiles.Location

Get the waypoint at the given index of a waypoint list, wrapping around to the start once the index runs past the end - safe to call with an ever-increasing index across multiple laps.

### waypoints.allWaypoints(list: waypoints.WaypointList): tiles.Location[]

Get all of the waypoints in a waypoint list as a plain array, for use with `for each`/`length of` blocks.

### waypoints.distanceTo(sprite: Sprite, location: tiles.Location): number

The distance in pixels from a sprite to a tile location.

### waypoints.angleTo(sprite: Sprite, location: tiles.Location): number

The angle in radians from a sprite to a tile location.

### waypoints.follow(list: waypoints.WaypointList, sprite: Sprite, thresholdDistance: number): void

Register a sprite to follow a waypoint list. Its nearest waypoint becomes the current target; the target automatically advances (looping around) once the sprite gets within `thresholdDistance` pixels of it.

### waypoints.currentWaypoint(list: waypoints.WaypointList, sprite: Sprite): tiles.Location

Get the waypoint a sprite is currently headed towards, or `undefined` if it isn't following this list.

### waypoints.planTurn(list: waypoints.WaypointList, sprite: Sprite, thresholdRadians: number): number

Returns `0` if the sprite's heading is already within `thresholdRadians` of its current waypoint, `-1` to turn left, or `+1` to turn right.

### waypoints.planAccel(list: waypoints.WaypointList, sprite: Sprite, thresholdRadians: number): number

Returns `+1` to accelerate, or `-1` to brake if the sprite's heading is off from its current waypoint by more than `thresholdRadians`.

### waypoints.onWaypointReached(list: waypoints.WaypointList, handler: (sprite: Sprite, index: number) => void): void

Runs `handler` whenever any sprite following `list` advances to a new waypoint.

### waypoints.debugShowWaypoints(list: waypoints.WaypointList, sprite: Sprite, prevTile: Image, curTile: Image, nextTile: Image): void

Highlights the previous/current/next waypoint tiles for `sprite` on the currently active tilemap, keeping them up to date (and reverting old ones to whatever tile was really there) as the sprite progresses. Leave a tile image empty to skip that role.

### waypoints.debugHideWaypoints(list: waypoints.WaypointList, sprite: Sprite): void

Stops debug-highlighting waypoints for `sprite`, restoring any highlighted tiles back to whatever was there before.

## Supported targets

* for PXT/arcade
(The metadata above is needed for package search.)
