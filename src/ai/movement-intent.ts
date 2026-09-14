import type { AIActionRequest, DrawingObject } from "./schemas.js";
import type { PhysicsShape } from "../world/phaser-world.js";

type IntentObject = Pick<DrawingObject, "type" | "affordances" | "physicsShape" | "boundingBox">;

const INVITES_CLIMBING = new Set<PhysicsShape>(["stairs", "slope", "ladder"]);
const CLIMB_TARGETS = new Set<PhysicsShape>(["stairs", "slope", "ladder", "obstacle"]);
const PASSIVE_ACTIONS = new Set<AIActionRequest["type"]>(["react", "speak", "scratch_head", "point"]);
const RIDE_REQUESTS = new Set<AIActionRequest["type"]>(["ride", "move", "use", "interact", "equip", "climb"]);
const INSTRUCTION = /(?:^|[^a-z])(?:arrow|text|writing|handwriting)|motion.?line|فلش|پیکان|نوشته/i;

export function inferredPhysicsShape(object: Pick<DrawingObject, "type" | "affordances" | "physicsShape">): PhysicsShape | null {
  // An arrow's affordances describe where to go («step down the stairs»), not what it is.
  if (INSTRUCTION.test(object.type)) return null;
  if (object.physicsShape && object.physicsShape !== "none") return object.physicsShape;
  const semantic = `${object.type} ${object.affordances.join(" ")}`.toLowerCase();
  if (/motor|bike|bicycle|scooter|vespa|\bcar\b|truck|\bbus\b|jeep|tractor|skateboard|vehicle|موتور|دوچرخه|ماشین|اسکوتر|کامیون|اتوبوس|جیپ|تراکتور|اسکیت/.test(semantic)) return "vehicle";
  if (/ladder|نردبان/.test(semantic)) return "ladder";
  if (/stair|step|پله/.test(semantic)) return "stairs";
  if (/slope|ramp|hill|mountain|شیب|تپه|کوه/.test(semantic)) return "slope";
  if (/platform|bridge|surface|پل|سکو/.test(semantic)) return "platform";
  if (/box|ball|rock|crate|توپ|سنگ|جعبه/.test(semantic)) return "dynamic";
  if (/wall|obstacle|barrier|tower|building|block|دیوار|مانع|برج|ساختمان/.test(semantic)) return "obstacle";
  return null;
}

function climb(targetObjectIndex: number): AIActionRequest {
  return { type: "climb", targetObjectIndex, direction: null, durationMs: 1200 };
}

function centerWithin(inner: IntentObject["boundingBox"], outer: IntentObject["boundingBox"]): boolean {
  const center = inner.x + inner.width / 2;
  return center >= outer.x && center <= outer.x + outer.width;
}

/**
 * Drawn stairs, ramps, hills, and ladders exist to be climbed. When the
 * provider only reacts to them, points at them, or targets the arrow the child
 * drew on them, the hero still goes up the structure the child built. Going
 * down is always a jump: the hero leaps off whatever it stands on.
 */
export function resolveMovementIntent(objects: IntentObject[], action: AIActionRequest | null): AIActionRequest | null {
  const shapes = objects.map(inferredPhysicsShape);
  const firstIndex = (allowed: ReadonlySet<PhysicsShape>): number =>
    shapes.findIndex((shape) => shape !== null && allowed.has(shape));
  const inviting = firstIndex(INVITES_CLIMBING);
  const climbable = inviting >= 0 ? inviting : firstIndex(CLIMB_TARGETS);
  const vehicle = shapes.indexOf("vehicle");

  const targetIndex = action?.targetObjectIndex ?? null;
  const target = targetIndex === null ? null : objects[targetIndex] ?? null;
  const targetShape = targetIndex === null ? null : shapes[targetIndex] ?? null;

  if (vehicle >= 0 && (!action || PASSIVE_ACTIONS.has(action.type) || RIDE_REQUESTS.has(action.type))) {
    if (action?.type === "ride" && targetShape === "vehicle") return action;
    if (!action || PASSIVE_ACTIONS.has(action.type) || action.type === "ride" || targetShape === "vehicle" || target === null) {
      const direction = action?.direction === "left" || action?.direction === "right" ? action.direction : null;
      return { type: "ride", targetObjectIndex: vehicle, direction, durationMs: Math.max(1200, action?.durationMs ?? 1200) };
    }
  }

  if (!action || PASSIVE_ACTIONS.has(action.type)) return inviting >= 0 ? climb(inviting) : action;

  if (action.direction === "down" && (action.type === "move" || action.type === "climb") && (targetShape === null || !CLIMB_TARGETS.has(targetShape))) {
    return { ...action, type: "jump" };
  }

  if (action.type === "climb") {
    if (targetShape !== null && CLIMB_TARGETS.has(targetShape)) return action;
    return climbable >= 0 ? climb(climbable) : action;
  }
  if (action.type === "move") {
    if (!target) {
      if (action.direction === "up" && inviting >= 0) return climb(inviting);
      return action;
    }
    if (targetShape !== null) return action;
    const holder = shapes.findIndex((shape, index) =>
      shape !== null && CLIMB_TARGETS.has(shape) && centerWithin(target.boundingBox, objects[index].boundingBox));
    return holder >= 0 ? climb(holder) : action;
  }
  return action;
}
