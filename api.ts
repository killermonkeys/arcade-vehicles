/**
 * Order colour-coded tilemap markers into a race track waypoint list, and
 * help drive AI-controlled sprites around it.
 *
 * Mark your track with coloured tiles: exactly one tile of a "start" colour,
 * then one or more tiles of each following checkpoint colour, in the order
 * the track should be driven. This extension finds all of those tiles on a
 * tilemap and chains them together with a nearest-neighbor search (within
 * each colour) to produce an ordered list of waypoints. A sprite can then be
 * registered to follow that list - the extension tracks which waypoint it's
 * currently headed towards (advancing and looping automatically as the
 * sprite gets close) - while plan_turn/plan_accel tell you which way to
 * steer and whether to accelerate or brake, so you can drive it with the
 * same controls/physics as the player.
 */
//% color="#B36521" icon="\uf1b9" block="Waypoints"
//% groups=['Track', 'Driving', 'Events', 'Debug']
namespace waypoints {
    /**
     * An ordered list of race track waypoints, plus the per-sprite progress
     * needed to drive one or more sprites around it. Create one with
     * waypoints.buildTrack.
     */
    export class WaypointList {
        locations: tiles.Location[];
        tilemap: tiles.TileMapData;
        followers: Follower[];
        changeHandlers: ((sprite: Sprite, index: number) => void)[];
        debugConfigs: DebugConfig[];
        tickerStarted: boolean;

        constructor(locations: tiles.Location[], tilemap: tiles.TileMapData) {
            this.locations = locations;
            this.tilemap = tilemap;
            this.followers = [];
            this.changeHandlers = [];
            this.debugConfigs = [];
            this.tickerStarted = false;
        }
    }

    class Follower {
        sprite: Sprite;
        currentIndex: number;
        thresholdDistance: number;

        constructor(sprite: Sprite, currentIndex: number, thresholdDistance: number) {
            this.sprite = sprite;
            this.currentIndex = currentIndex;
            this.thresholdDistance = thresholdDistance;
        }
    }

    class DebugConfig {
        sprite: Sprite;
        prevTile: Image;
        curTile: Image;
        nextTile: Image;
        paintedIndices: number[];
        // The tile that was actually on the active tilemap at each painted
        // index, captured just before painting over it - not the marker
        // tile - so reverting is correct even if buildTrack scanned a
        // different (e.g. hidden authoring-only) tilemap than the one
        // that's currently active in the scene.
        originalImages: Image[];

        constructor(sprite: Sprite, prevTile: Image, curTile: Image, nextTile: Image) {
            this.sprite = sprite;
            this.prevTile = prevTile;
            this.curTile = curTile;
            this.nextTile = nextTile;
            this.paintedIndices = [];
            this.originalImages = [];
        }
    }

    class DebugRole {
        index: number;
        image: Image;

        constructor(index: number, image: Image) {
            this.index = index;
            this.image = image;
        }
    }

    /**
     * Scan a tilemap for the given sequence of marker tile colours and
     * return them as an ordered waypoint list.
     *
     * The first colour must mark exactly one tile - the start/finish line
     * (the game will fail with an error if more than one is found). Every
     * colour after that can mark one or more tiles: starting from the last
     * waypoint found so far, each colour's tiles are repeatedly chained on
     * by picking whichever one of that colour is nearest, until none of
     * that colour are left. This means the result only ever moves forward
     * through the sequence of colours you provide.
     *
     * The tilemap you pass in here doesn't need to be the one currently
     * active/rendered in the scene - it can be a separate, never-shown copy
     * of your level with marker tiles painted onto it (handy if you don't
     * want the markers visible in the real level). It just needs to have
     * the same width, height, and tile scale as the tilemap you actually
     * play on, so each waypoint's grid position lines up correctly.
     * @param tilemap the tilemap to search for marker tiles
     * @param tileColours the marker tile colours, in track order (start colour first)
     */
    //% blockId=waypoints_build_track
    //% block="waypoints on tilemap $tilemap with tile colours $tileColours"
    //% tilemap.shadow=tiles_tilemap_editor
    //% tileColours.shadow="lists_create_with"
    //% tileColours.defl="tileset_tile_picker"
    //% blockSetVariable=waypointList
    //% group="Track" weight=100 blockGap=8
    export function buildTrack(tilemap: tiles.TileMapData, tileColours: Image[]): WaypointList {
        const locations = orderWaypoints(tilemap, tileColours);
        return new WaypointList(locations, tilemap);
    }

    /**
     * Get the waypoint at the given index of a waypoint list, wrapping
     * around to the start once the index runs past the end of the list.
     * This makes it safe to keep incrementing an index every time a racer
     * reaches its current target, across as many laps as you like.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param index the waypoint index, can be any integer
     */
    //% blockId=waypoints_waypoint_at
    //% block="waypoint at index $index of $list"
    //% group="Track" weight=95 blockGap=8
    export function waypointAt(list: WaypointList, index: number): tiles.Location {
        if (!list || !list.locations || list.locations.length === 0) return undefined;
        const count = list.locations.length;
        const wrapped = ((index % count) + count) % count;
        return list.locations[wrapped];
    }

    /**
     * Get all of the waypoints in a waypoint list as a plain array, for use
     * with "for each" or "length of" blocks.
     * @param list the waypoint list, from waypoints.buildTrack
     */
    //% blockId=waypoints_all_waypoints
    //% block="all waypoints in $list"
    //% group="Track" weight=90 blockGap=8
    export function allWaypoints(list: WaypointList): tiles.Location[] {
        return list ? list.locations : [];
    }

    /**
     * The distance in pixels from a sprite to a tile location.
     * @param sprite the sprite
     * @param location the tile location
     */
    //% blockId=waypoints_distance_to
    //% block="distance from $sprite to $location"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Driving" weight=85 blockGap=8
    export function distanceTo(sprite: Sprite, location: tiles.Location): number {
        if (!sprite || !location) return 0;
        return Math.sqrt((location.x - sprite.x) * (location.x - sprite.x) + (location.y - sprite.y) * (location.y - sprite.y));
    }

    /**
     * The angle in radians from a sprite to a tile location.
     * @param sprite the sprite
     * @param location the tile location
     */
    //% blockId=waypoints_angle_to
    //% block="angle from $sprite to $location"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Driving" weight=84 blockGap=8
    export function angleTo(sprite: Sprite, location: tiles.Location): number {
        if (!sprite || !location) return 0;
        return Math.atan2(location.y - sprite.y, location.x - sprite.x);
    }

    /**
     * Register a sprite to follow a waypoint list. The nearest waypoint to
     * the sprite right now becomes its current target; once the sprite gets
     * within the threshold distance of it, the target automatically
     * advances to the next waypoint (looping back to the start once the end
     * of the list is reached).
     * @param list the waypoint list, from waypoints.buildTrack
     * @param sprite the sprite that should follow the list
     * @param thresholdDistance how close (in pixels) the sprite must get before advancing to the next waypoint
     */
    //% blockId=waypoints_follow
    //% block="make $sprite follow $list with threshold $thresholdDistance px"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% thresholdDistance.defl=8
    //% group="Driving" weight=80 blockGap=8
    export function follow(list: WaypointList, sprite: Sprite, thresholdDistance: number): void {
        if (!list || !sprite || !list.locations || list.locations.length === 0) return;

        const existing = findFollower(list, sprite);
        if (existing) {
            existing.thresholdDistance = thresholdDistance;
        } else {
            const nearestIndex = nearestWaypointIndex(list, sprite);
            list.followers.push(new Follower(sprite, nearestIndex, thresholdDistance));
        }

        ensureTicker(list);
    }

    /**
     * Get the waypoint a sprite is currently headed towards, or undefined
     * if the sprite isn't following this waypoint list.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param sprite the sprite
     */
    //% blockId=waypoints_current_waypoint
    //% block="current waypoint of $sprite following $list"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Driving" weight=75 blockGap=8
    export function currentWaypoint(list: WaypointList, sprite: Sprite): tiles.Location {
        if (!list || !sprite) return undefined;
        const follower = findFollower(list, sprite);
        if (!follower) return undefined;
        return list.locations[follower.currentIndex];
    }

    /**
     * Plan whether a sprite following a waypoint list should turn left or
     * right to face its current waypoint. Returns 0 if the sprite is
     * already facing close enough to the waypoint (within the threshold),
     * -1 to turn left, or +1 to turn right.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param sprite the sprite, which must already be following the list (see waypoints.follow)
     * @param thresholdRadians how far off (in radians) the sprite's heading can be before it needs to turn
     */
    //% blockId=waypoints_plan_turn
    //% block="plan turn for $sprite following $list with threshold $thresholdRadians"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% thresholdRadians.defl=0.2
    //% group="Driving" weight=70 blockGap=8
    export function planTurn(list: WaypointList, sprite: Sprite, thresholdRadians: number): number {
        if (!list || !sprite || !findFollower(list, sprite)) {
            console.log("waypoints: sprite is not following this waypoint list");
            return 0;
        }

        const diff = headingDifference(list, sprite);
        if (Math.abs(diff) <= thresholdRadians) return 0;
        return diff > 0 ? 1 : -1;
    }

    /**
     * Plan whether a sprite following a waypoint list should accelerate or
     * brake. Returns +1 to accelerate, unless the sprite's heading is off
     * from its current waypoint by more than the threshold, in which case
     * it returns -1 to brake.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param sprite the sprite, which must already be following the list (see waypoints.follow)
     * @param thresholdRadians how far off (in radians) the sprite's heading can be before it should brake instead of accelerating
     */
    //% blockId=waypoints_plan_accel
    //% block="plan accel for $sprite following $list with threshold $thresholdRadians"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% thresholdRadians.defl=0.6
    //% group="Driving" weight=65 blockGap=8
    export function planAccel(list: WaypointList, sprite: Sprite, thresholdRadians: number): number {
        if (!list || !sprite || !findFollower(list, sprite)) {
            console.log("waypoints: sprite is not following this waypoint list");
            return 0;
        }

        const diff = headingDifference(list, sprite);
        return Math.abs(diff) > thresholdRadians ? -1 : 1;
    }

    /**
     * Run some code whenever a sprite following this waypoint list reaches
     * its current waypoint and advances to the next one.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param handler code to run, given the sprite and its new waypoint index
     */
    //% blockId=waypoints_on_waypoint_reached
    //% block="on waypoint reached of $list"
    //% draggableParameters="reporter"
    //% group="Events" weight=60 blockGap=8
    export function onWaypointReached(list: WaypointList, handler: (sprite: Sprite, index: number) => void): void {
        if (!list || !handler) return;
        list.changeHandlers.push(handler);
    }

    /**
     * For debugging: highlight the previous, current, and next waypoint for
     * a sprite by changing their tiles on the currently active tilemap. The
     * highlighted tiles move along automatically as the sprite advances,
     * and any tile that's no longer prev/current/next is restored to
     * whatever tile was actually there before it got highlighted (not the
     * waypoints.buildTrack marker tile - this works correctly even if you
     * built the waypoint list from a separate, hidden tilemap). Leave any
     * of the three images empty to skip that role.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param sprite the sprite to show debug waypoints for, which must already be following the list (see waypoints.follow)
     * @param prevTile tile image for the previous waypoint
     * @param curTile tile image for the current waypoint
     * @param nextTile tile image for the next waypoint
     */
    //% blockId=waypoints_debug_show
    //% block="show prev $prevTile current $curTile next $nextTile waypoints on $list for $sprite"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% prevTile.shadow=tileset_tile_picker
    //% curTile.shadow=tileset_tile_picker
    //% nextTile.shadow=tileset_tile_picker
    //% group="Debug" weight=50 blockGap=8
    export function debugShowWaypoints(list: WaypointList, sprite: Sprite, prevTile: Image, curTile: Image, nextTile: Image): void {
        if (!list || !sprite) return;

        let config = findDebugConfig(list, sprite);
        if (!config) {
            config = new DebugConfig(sprite, prevTile, curTile, nextTile);
            list.debugConfigs.push(config);
        } else {
            config.prevTile = prevTile;
            config.curTile = curTile;
            config.nextTile = nextTile;
        }

        paintDebug(list, config);
    }

    /**
     * Stop debug-highlighting waypoints for a sprite, and restore any
     * highlighted tiles back to whatever was there before.
     * @param list the waypoint list, from waypoints.buildTrack
     * @param sprite the sprite to stop showing debug waypoints for
     */
    //% blockId=waypoints_debug_hide
    //% block="hide debug waypoints on $list for $sprite"
    //% sprite.shadow=variables_get
    //% sprite.defl=mySprite
    //% group="Debug" weight=45 blockGap=8
    export function debugHideWaypoints(list: WaypointList, sprite: Sprite): void {
        if (!list || !sprite) return;

        const config = findDebugConfig(list, sprite);
        if (!config) return;

        for (let i = 0; i < config.paintedIndices.length; i++) {
            tiles.setTileAt(list.locations[config.paintedIndices[i]], config.originalImages[i]);
        }

        list.debugConfigs = list.debugConfigs.filter(function (c) {
            return c.sprite.id !== sprite.id;
        });
    }

    function orderWaypoints(tilemap: tiles.TileMapData, tileColours: Image[]): tiles.Location[] {
        let result: tiles.Location[] = [];
        if (!tilemap || !tileColours || tileColours.length === 0) return result;

        const startTiles = getTilesOfTypeForMap(tilemap, tileColours[0]);
        if (startTiles.length === 0) {
            console.log("waypoints: no start tile found for the first tile colour");
            return result;
        }
        if (startTiles.length > 1) {
            control.fail("waypoints: expected exactly one start tile, found " + startTiles.length);
            return result;
        }

        let current = startTiles[0];
        result.push(current);

        for (let colourIndex = 1; colourIndex < tileColours.length; colourIndex++) {
            const remaining = getTilesOfTypeForMap(tilemap, tileColours[colourIndex]);

            while (remaining.length > 0) {
                let nearestIndex = 0;
                let nearestDistance = gridDistanceSquared(current, remaining[0]);

                for (let j = 1; j < remaining.length; j++) {
                    const d = gridDistanceSquared(current, remaining[j]);
                    if (d < nearestDistance) {
                        nearestDistance = d;
                        nearestIndex = j;
                    }
                }

                current = remaining[nearestIndex];
                result.push(current);
                remaining.splice(nearestIndex, 1);
            }
        }

        return result;
    }

    /**
     * Find tiles of a type for a specific tile map, similar to tiles.getTilesOfType but for any map
     */
    function getTilesOfTypeForMap(tilemap: tiles.TileMapData, tile: Image): tiles.Location[] {
        if (!tilemap || !tile) {
            console.log("error, no tilemap or tile");
            return [];
        }
        let locations: tiles.Location[] = [];
        for (let i = 0; i < tilemap.width; i++) {
            for (let j = 0; j < tilemap.height; j++) {
                if (tilemap.getTileImage(tilemap.getTile(i, j)).equals(tile)) {
                    let loc = new tiles.Location(i, j, null)
                    locations.push(loc);
                }
            }
        }
        return locations;
    }

    // Uses column/row (grid coordinates) rather than x/y (pixel coordinates)
    // because a Location's x/y getters read the scale of whichever tilemap
    // is currently active in the scene - which may not be the tilemap
    // passed in here. Column/row are stable regardless of which tilemap is
    // active, and scale equally in both axes, so nearest-neighbor ordering
    // comes out identical either way.
    function gridDistanceSquared(a: tiles.Location, b: tiles.Location): number {
        const dCol = a.column - b.column;
        const dRow = a.row - b.row;
        return dCol * dCol + dRow * dRow;
    }

    function findFollower(list: WaypointList, sprite: Sprite): Follower {
        for (let i = 0; i < list.followers.length; i++) {
            if (list.followers[i].sprite.id === sprite.id) return list.followers[i];
        }
        return undefined;
    }

    function findDebugConfig(list: WaypointList, sprite: Sprite): DebugConfig {
        for (let i = 0; i < list.debugConfigs.length; i++) {
            if (list.debugConfigs[i].sprite.id === sprite.id) return list.debugConfigs[i];
        }
        return undefined;
    }

    function nearestWaypointIndex(list: WaypointList, sprite: Sprite): number {
        let nearestIndex = 0;
        let nearestDistance = distanceTo(sprite, list.locations[0]);

        for (let i = 1; i < list.locations.length; i++) {
            const d = distanceTo(sprite, list.locations[i]);
            if (d < nearestDistance) {
                nearestDistance = d;
                nearestIndex = i;
            }
        }

        return nearestIndex;
    }

    function ensureTicker(list: WaypointList): void {
        if (list.tickerStarted) return;
        list.tickerStarted = true;

        game.onUpdate(function () {
            tick(list);
        });
    }

    function tick(list: WaypointList): void {
        let cleanupNeeded = false;

        for (let i = 0; i < list.followers.length; i++) {
            const follower = list.followers[i];
            if (!follower.sprite || (follower.sprite.flags & sprites.Flag.Destroyed)) {
                cleanupNeeded = true;
                continue;
            }

            const target = list.locations[follower.currentIndex];
            if (distanceTo(follower.sprite, target) <= follower.thresholdDistance) {
                follower.currentIndex = (follower.currentIndex + 1) % list.locations.length;
                fireWaypointReached(list, follower.sprite, follower.currentIndex);
                updateDebugForSprite(list, follower.sprite);
            }
        }

        if (cleanupNeeded) {
            list.followers = list.followers.filter(function (f) {
                return f.sprite && !(f.sprite.flags & sprites.Flag.Destroyed);
            });
        }
    }

    function fireWaypointReached(list: WaypointList, sprite: Sprite, index: number): void {
        for (let i = 0; i < list.changeHandlers.length; i++) {
            list.changeHandlers[i](sprite, index);
        }
    }

    function updateDebugForSprite(list: WaypointList, sprite: Sprite): void {
        const config = findDebugConfig(list, sprite);
        if (config) paintDebug(list, config);
    }

    function paintDebug(list: WaypointList, config: DebugConfig): void {
        const follower = findFollower(list, config.sprite);
        if (!follower || list.locations.length === 0) return;

        const count = list.locations.length;
        const curIndex = follower.currentIndex;
        const prevIndex = (curIndex - 1 + count) % count;
        const nextIndex = (curIndex + 1) % count;

        // Pushed in prev, next, cur order so that when indices collide
        // (e.g. on very short tracks), the later role wins: cur > next > prev.
        const roles = [
            new DebugRole(prevIndex, config.prevTile),
            new DebugRole(nextIndex, config.nextTile),
            new DebugRole(curIndex, config.curTile),
        ];

        const newPainted: number[] = [];
        const newImages: Image[] = [];

        for (let i = 0; i < roles.length; i++) {
            const role = roles[i];
            if (!role.image) continue;

            const existingSlot = newPainted.indexOf(role.index);
            if (existingSlot >= 0) {
                newImages[existingSlot] = role.image;
            } else {
                newPainted.push(role.index);
                newImages.push(role.image);
            }
        }

        // Revert indices that are no longer prev/cur/next back to whatever
        // tile was really there before we painted over it.
        for (let i = 0; i < config.paintedIndices.length; i++) {
            const idx = config.paintedIndices[i];
            if (newPainted.indexOf(idx) < 0) {
                tiles.setTileAt(list.locations[idx], config.originalImages[i]);
            }
        }

        // Paint the new set, capturing each index's current tile the first
        // time it's painted (or carrying forward the already-captured one
        // if it was already highlighted, since its live tile is now ours).
        const newOriginalImages: Image[] = [];
        for (let i = 0; i < newPainted.length; i++) {
            const idx = newPainted[i];
            const previousSlot = config.paintedIndices.indexOf(idx);
            const original = previousSlot >= 0
                ? config.originalImages[previousSlot]
                : tiles.tileImageAtLocation(list.locations[idx]);
            newOriginalImages.push(original);
            tiles.setTileAt(list.locations[idx], newImages[i]);
        }

        config.paintedIndices = newPainted;
        config.originalImages = newOriginalImages;
    }

    function normalizeAngle(angle: number): number {
        let a = angle % (2 * Math.PI);
        if (a > Math.PI) a -= 2 * Math.PI;
        if (a <= -Math.PI) a += 2 * Math.PI;
        return a;
    }

    function headingDifference(list: WaypointList, sprite: Sprite): number {
        const target = currentWaypoint(list, sprite);
        if (!target) return 0;

        const heading = Math.atan2(sprite.vy, sprite.vx);
        const toTarget = angleTo(sprite, target);
        return normalizeAngle(toTarget - heading);
    }
}
