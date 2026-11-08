import {
  GestureType,
  HandPose,
  DetectedGesture
} from './gestureTypes';

export class GestureClassifier {
  // Gesture hold tracking for debouncing (-1 for dual-hand Namaste, 0/1 for single hands)
  private pendingGesture: Map<number, { type: GestureType; since: number }> = new Map();
  private lastFiredTime: Map<string, number> = new Map();

  // Cooldowns (ms)
  private readonly COOLDOWNS: Record<GestureType, number> = {
    NONE: 0,
    ROCKET: 500,
    ANAR: 0, // Continuous
    STARBURST: 850,
    ROMAN_CANDLE: 300,
    PHOOLJHADI: 0, // Continuous
    FINGER_HEART: 1100,
    GRAND_FINALE: 4000
  };

  private readonly HOLD_REQUIRED_MS = 100;
  private readonly NAMASTE_HOLD_MS = 180;

  public classify(hands: HandPose[], screenW: number): DetectedGesture[] {
    const now = performance.now();
    const results: DetectedGesture[] = [];

    // 1. Dual-Hand Check: Namaste Mudra for Grand Finale (Priority 1)
    if (hands.length >= 2) {
      const h1 = hands[0];
      const h2 = hands[1];

      const palmDist = Math.hypot(
        h1.palmCenter.x - h2.palmCenter.x,
        h1.palmCenter.y - h2.palmCenter.y
      );
      const tipDist = Math.hypot(
        h1.landmarks[8].x - h2.landmarks[8].x,
        h1.landmarks[8].y - h2.landmarks[8].y
      );

      const maxPalmDist = Math.max(140, screenW * 0.16);
      const maxTipDist = Math.max(120, screenW * 0.14);

      // Both hands pointing upwards in front of chest
      const isPointingUp =
        h1.landmarks[8].y < h1.landmarks[0].y - 20 &&
        h2.landmarks[8].y < h2.landmarks[0].y - 20;

      // Palms and fingers brought together
      const isHandsTogether = palmDist < maxPalmDist && tipDist < maxTipDist;
      const isFingersOpen =
        (h1.extendedFingers.index || h1.extendedFingers.middle) &&
        (h2.extendedFingers.index || h2.extendedFingers.middle);

      if (isPointingUp && isHandsTogether && isFingersOpen) {
        const pending = this.pendingGesture.get(-1);
        if (!pending || pending.type !== 'GRAND_FINALE') {
          this.pendingGesture.set(-1, { type: 'GRAND_FINALE', since: now });
        } else if (
          now - pending.since >= this.NAMASTE_HOLD_MS &&
          this.canTrigger('GRAND_FINALE', now)
        ) {
          results.push({
            type: 'GRAND_FINALE',
            confidence: 0.99,
            triggerPoint: {
              x: (h1.palmCenter.x + h2.palmCenter.x) / 2,
              y: (h1.palmCenter.y + h2.palmCenter.y) / 2
            },
            handIndex: -1,
            isContinuous: false
          });
          this.markFired('GRAND_FINALE', now);
          this.pendingGesture.delete(-1);
          return results;
        }
      } else {
        this.pendingGesture.delete(-1);
      }
    } else {
      this.pendingGesture.delete(-1);
    }

    // 2. Single-Hand Gestures
    hands.forEach((hand, idx) => {
      const gesture = this.classifySingleHand(hand, idx, now, screenW);
      if (gesture) {
        results.push(gesture);
      }
    });

    return results;
  }

  private classifySingleHand(
    hand: HandPose,
    handIndex: number,
    now: number,
    screenW: number
  ): DetectedGesture | null {
    const { extendedFingers, landmarks, isPinching, palmCenter } = hand;
    const wrist = landmarks[0];
    const indexPip = landmarks[6];
    const indexTip = landmarks[8];
    const thumbTip = landmarks[4];

    // Pinch-family poses are separated by the three supporting fingers:
    // OK sign (2-3 extended) => Anar, Korean finger heart (all curled) => heart shell.
    if (isPinching) {
      const supportFingers = [extendedFingers.middle, extendedFingers.ring, extendedFingers.pinky].filter(Boolean).length;
      const pending = this.pendingGesture.get(handIndex);
      if (supportFingers >= 2) {
        if (!pending || pending.type !== 'ANAR') {
          this.pendingGesture.set(handIndex, { type: 'ANAR', since: now });
          return null;
        }
        if (now - pending.since < 170) return null;
        return { type: 'ANAR', confidence: 0.95, triggerPoint: palmCenter, handIndex, handedness: hand.handedness, isContinuous: true };
      }
      const fingerHeartPose = supportFingers === 0 && extendedFingers.index && extendedFingers.thumb &&
        hand.pinchDistance < Math.max(26, screenW * 0.027);
      if (fingerHeartPose) {
        if (!pending || pending.type !== 'FINGER_HEART') {
          this.pendingGesture.set(handIndex, { type: 'FINGER_HEART', since: now });
          return null;
        }
        if (now - pending.since < 240 || !this.canTrigger('FINGER_HEART', now, handIndex)) return null;
        this.markFired('FINGER_HEART', now, handIndex);
        return {
          type: 'FINGER_HEART', confidence: 0.96,
          triggerPoint: { x: (indexTip.x + thumbTip.x) / 2, y: (indexTip.y + thumbTip.y) / 2 },
          handIndex, handedness: hand.handedness, isContinuous: false
        };
      }
      if (supportFingers === 0) {
        this.pendingGesture.delete(handIndex);
        return null;
      }
      if (pending && pending.type !== 'PHOOLJHADI') this.pendingGesture.set(handIndex, { type: 'PHOOLJHADI', since: now });
      return {
        type: 'PHOOLJHADI', confidence: 0.95,
        triggerPoint: { x: (indexTip.x + thumbTip.x) / 2, y: (indexTip.y + thumbTip.y) / 2 },
        handIndex, handedness: hand.handedness, isContinuous: true
      };
    }

    // Direction check for index finger: pointing UP
    const isIndexPointingUp = indexTip.y < indexPip.y - 12 && indexTip.y < wrist.y - 20;

    let candidate: GestureType = 'NONE';
    let triggerPoint = { x: indexTip.x, y: indexTip.y };
    let isContinuous = false;

    // Priority 3: Rocket (☝️ Index Pointing UP only)
    if (
      extendedFingers.index &&
      isIndexPointingUp &&
      !extendedFingers.middle &&
      !extendedFingers.ring &&
      !extendedFingers.pinky
    ) {
      candidate = 'ROCKET';
      triggerPoint = { x: indexTip.x, y: indexTip.y };
      isContinuous = false;
    }
    // Priority 4: Roman Candle (✌️ Peace Sign: Both Index & Middle pointing UP)
    else if (
      extendedFingers.index &&
      extendedFingers.middle &&
      isIndexPointingUp &&
      !extendedFingers.ring &&
      !extendedFingers.pinky
    ) {
      candidate = 'ROMAN_CANDLE';
      const middleTip = landmarks[12];
      triggerPoint = {
        x: (indexTip.x + middleTip.x) / 2,
        y: (indexTip.y + middleTip.y) / 2
      };
      isContinuous = false;
    }
    // Priority 6: Starburst (✋ Open Palm: All 5 fingers extended spread apart)
    else if (this.isAllFingersExtended(hand)) {
      candidate = 'STARBURST';
      triggerPoint = { x: palmCenter.x, y: palmCenter.y };
      isContinuous = false;
    }

    if (candidate === 'NONE') {
      this.pendingGesture.delete(handIndex);
      return null;
    }

    // Debounce hold requirement
    const pending = this.pendingGesture.get(handIndex);
    if (!pending || pending.type !== candidate) {
      this.pendingGesture.set(handIndex, { type: candidate, since: now });
      return null;
    }

    const requiredHold = candidate === 'STARBURST' ? 170 : this.HOLD_REQUIRED_MS;
    if (now - pending.since < requiredHold) {
      return null;
    }

    if (!this.canTrigger(candidate, now, handIndex)) {
      return null;
    }

    if (!isContinuous) {
      this.markFired(candidate, now, handIndex);
    }

    return {
      type: candidate,
      confidence: 0.9,
      triggerPoint,
      handIndex,
      handedness: hand.handedness,
      isContinuous
    };
  }

  private isAllFingersExtended(hand: HandPose): boolean {
    const { extendedFingers } = hand;
    return (
      extendedFingers.thumb &&
      extendedFingers.index &&
      extendedFingers.middle &&
      extendedFingers.ring &&
      extendedFingers.pinky &&
      Math.hypot(hand.landmarks[4].x - hand.landmarks[20].x, hand.landmarks[4].y - hand.landmarks[20].y) >
        Math.hypot(hand.landmarks[5].x - hand.landmarks[17].x, hand.landmarks[5].y - hand.landmarks[17].y) * 1.65
    );
  }

  private canTrigger(type: GestureType, now: number, handIdx: number = 0): boolean {
    const key = `${type}_${handIdx}`;
    const lastTime = this.lastFiredTime.get(key) || 0;
    const cooldown = this.COOLDOWNS[type];
    return now - lastTime >= cooldown;
  }

  private markFired(type: GestureType, now: number, handIdx: number = 0): void {
    const key = `${type}_${handIdx}`;
    this.lastFiredTime.set(key, now);
  }
}
