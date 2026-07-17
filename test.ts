// tests go here; this will not be compiled when this package is used as an extension.
// Listed only under pxt.json "testFiles", so consumers never receive it.

function assert(condition: boolean, code: number): void {
    control.assert(condition, code);
}

function approx(a: number, b: number, eps: number): boolean {
    return Math.abs(a - b) <= eps;
}

// --- vehicles: create / registry / degrees ---

const carImg = image.create(8, 8);
carImg.fill(2);

const car = vehicles.create(carImg, SpriteKind.Player);
assert(!!car, 1001);
assert(!!car.sprite, 1002);
assert(vehicles.vehicleOf(car.sprite) == car, 1003);
assert(vehicles.all().indexOf(car) >= 0, 1004);

vehicles.setAngle(car, -90);
assert(approx(vehicles.angle(car), -90, 0.01), 1005);
assert(approx(car.angle, -90, 0.01), 1006);

vehicles.setSpeed(car, 100);
assert(approx(vehicles.speed(car), 100, 0.01), 1007);
// -90° => velocity straight up (negative y in Arcade)
assert(approx(car.sprite.vx, 0, 1), 1008);
assert(approx(car.sprite.vy, -100, 1), 1009);

const angleBefore = car.angle;
vehicles.setSpeed(car, 0);
vehicles.drive(car, 1, 0);
assert(car.angle > angleBefore, 1010); // can turn while stopped

const wrapped = vehicles.createFromSprite(car.sprite);
assert(wrapped == car, 1011);

const otherSprite = sprites.create(carImg.clone(), SpriteKind.Enemy);
const other = vehicles.createFromSprite(otherSprite);
assert(!!other, 1012);
assert(other != car, 1013);
assert(vehicles.all().length >= 2, 1014);

// --- gate crossing math (via no-block __testing helpers) ---

// Forward across a vertical gate at x=50 from left to right.
assert(waypoints.__testing.crossesGateFacingRight(40, 50, 60, 50, 50, 50, 20), 1101);
// Reverse crossing should not count.
assert(!waypoints.__testing.crossesGateFacingRight(60, 50, 40, 50, 50, 50, 20), 1102);
// Miss above the half-width.
assert(!waypoints.__testing.crossesGateFacingRight(40, 0, 60, 0, 50, 50, 20), 1103);
// Clip the edge of the gate (within halfWidth + slack).
assert(waypoints.__testing.crossesGateFacingRight(40, 69, 60, 69, 50, 50, 20), 1104);

// Finish line along y=100 from x=0..40; upward (negative y) is forward.
assert(waypoints.__testing.crossesFinish(20, 110, 20, 90, 0, 100, 40, 100, 0, -1), 1201);
assert(!waypoints.__testing.crossesFinish(20, 90, 20, 110, 0, 100, 40, 100, 0, -1), 1202);
assert(!waypoints.__testing.crossesFinish(80, 110, 80, 90, 0, 100, 40, 100, 0, -1), 1203);

game.splash("tests passed");
