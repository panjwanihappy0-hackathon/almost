"""Turns what the camera sees each frame into product events. Plain code, no AI.

recognise.py says which product (if any) is in each hand; this file decides when a pickup
starts and how it ends. It has no camera code, so it can be tested on its own
(see test_interactions.py) and driven by the simulator.

Events:
  pickup    a product was taken from a shelf zone and is now in a shopper's hand
  put_back  the hand went back to a shelf zone and the product left the hand (hold_s = how long)
  taken     the product left the hand away from the shelf, or the shopper left the view with it
  compare   the same shopper picked up two different products close together (sku + other_sku)
"""

from __future__ import annotations

import uuid
from collections import Counter, deque
from dataclasses import dataclass, field

VOTE_FRAMES = 5  # look at the last 5 frames for each hand...
VOTES_NEEDED = 3  # ...and trust a product once it was seen in 3 of them
ZONE_MEMORY_S = 2.0  # a hand that was in a shelf zone this recently can pick something up from it
CONFIRM_S = 1.0  # a product held this long counts as picked up, even if the hand is still over the shelf
END_GRACE_S = 1.5  # a product unseen in the hand this long has left the hand
PUT_BACK_WINDOW_S = 1.0  # ...and was put back if the hand was in a shelf zone this close to that moment
COMPARE_WINDOW_S = 30.0  # two products picked up by the same shopper this close together were compared
FORGET_HAND_S = 10.0  # forget a hand not seen for this long


@dataclass
class Event:
    type: str  # pickup | put_back | taken | compare
    ts: float  # unix seconds
    sku: str
    zone: str
    camera: str
    hold_s: float | None = None
    other_sku: str | None = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])


@dataclass
class HandSighting:
    """One hand in one frame."""

    person: int  # the tracker's short-lived number for this person, this camera only
    side: str  # "L" or "R"
    sku: str | None  # product recognised in the hand, None if nothing
    zone: str | None  # shelf zone the hand is inside, None if outside every zone


@dataclass
class _Hold:
    sku: str
    zone: str
    start: float
    last_seen: float
    confirmed: bool = False  # a pickup event has been sent for this hold


@dataclass
class _Hand:
    votes: deque = field(default_factory=lambda: deque(maxlen=VOTE_FRAMES))
    last_zone: str | None = None
    last_in_zone: float | None = None  # when the hand was last inside any shelf zone
    last_seen: float = 0.0
    in_zone_now: bool = False
    hold: _Hold | None = None


class InteractionTracker:
    def __init__(self, camera: str, presentation: bool = False):
        """presentation=True: no shelf zones; anything held up to the camera counts (showrooms, demos)."""
        self.camera = camera
        self.presentation = presentation
        self.hands: dict[tuple[int, str], _Hand] = {}
        self.recent_pickups: dict[int, list[tuple[str, float]]] = {}  # person -> (sku, time)
        self.compared: set[tuple[int, str, str]] = set()  # (person, sku_a, sku_b) already reported

    def update(self, t: float, sightings: list[HandSighting]) -> list[Event]:
        events: list[Event] = []
        seen = set()
        for s in sightings:
            key = (s.person, s.side)
            seen.add(key)
            hand = self.hands.setdefault(key, _Hand())
            hand.votes.append(s.sku)
            hand.last_seen = t
            hand.in_zone_now = s.zone is not None
            if s.zone is not None:
                hand.last_zone, hand.last_in_zone = s.zone, t

            sku = self._stable_sku(hand)
            hold = hand.hold
            if hold and sku == hold.sku:
                hold.last_seen = t
            elif hold and sku is not None:
                # A different product is now in this hand: the first one left it.
                events += self._end(key, hand)
                hold = None
            if hand.hold is None and sku is not None:
                zone = self._pickup_zone(hand, t)
                if zone is not None:
                    hand.hold = _Hold(sku=sku, zone=zone, start=t, last_seen=t)
            if hand.hold and not hand.hold.confirmed and sku == hand.hold.sku:
                events += self._maybe_confirm(key, hand, t)

        for key, hand in list(self.hands.items()):
            if key not in seen:
                hand.votes.append(None)
            if hand.hold and t - hand.hold.last_seen > END_GRACE_S:
                events += self._end(key, hand)
            if hand.hold is None and t - hand.last_seen > FORGET_HAND_S:
                del self.hands[key]

        for person in list(self.recent_pickups):
            self.recent_pickups[person] = [(k, pt) for k, pt in self.recent_pickups[person] if t - pt <= COMPARE_WINDOW_S]
            if not self.recent_pickups[person]:
                del self.recent_pickups[person]
        return events

    def held_by_zone(self) -> dict[str, list[str]]:
        """Products in shoppers' hands right now, per zone: what the screens should show."""
        held: dict[str, list[str]] = {}
        for hand in self.hands.values():
            if hand.hold and hand.hold.confirmed:
                skus = held.setdefault(hand.hold.zone, [])
                if hand.hold.sku not in skus:
                    skus.append(hand.hold.sku)
        return {zone: sorted(skus) for zone, skus in held.items()}

    def close(self, t: float) -> list[Event]:
        """End every hold, e.g. when the camera stops."""
        events: list[Event] = []
        for key, hand in list(self.hands.items()):
            if hand.hold:
                events += self._end(key, hand)
        return events

    def _stable_sku(self, hand: _Hand) -> str | None:
        counts = Counter(v for v in hand.votes if v is not None)
        if not counts:
            return None
        sku, n = counts.most_common(1)[0]
        return sku if n >= VOTES_NEEDED else None

    def _pickup_zone(self, hand: _Hand, t: float) -> str | None:
        if self.presentation:
            return hand.last_zone or "any"
        if hand.last_in_zone is not None and t - hand.last_in_zone <= ZONE_MEMORY_S:
            return hand.last_zone
        return None  # a product that never came from a shelf zone, e.g. clothes someone is wearing

    def _maybe_confirm(self, key: tuple[int, str], hand: _Hand, t: float) -> list[Event]:
        hold = hand.hold
        assert hold is not None
        # Picked up = carried out of the shelf zone, or held long enough to rule out a hand
        # brushing past a product that is still on the shelf.
        # Only called on frames where the product is in the hand.
        if not (self.presentation or not hand.in_zone_now or t - hold.start >= CONFIRM_S):
            return []
        hold.confirmed = True
        person = key[0]
        events = [Event("pickup", hold.start, hold.sku, hold.zone, self.camera)]

        others = {k for k, _ in self.recent_pickups.get(person, []) if k != hold.sku}
        others |= {h.hold.sku for k, h in self.hands.items() if k[0] == person and h.hold and h.hold.confirmed and h.hold.sku != hold.sku}
        for other in sorted(others):
            pair = (person, *sorted((hold.sku, other)))
            if pair not in self.compared:
                self.compared.add(pair)
                events.append(Event("compare", t, hold.sku, hold.zone, self.camera, other_sku=other))
        self.recent_pickups.setdefault(person, []).append((hold.sku, t))
        return events

    def _end(self, key: tuple[int, str], hand: _Hand) -> list[Event]:
        hold = hand.hold
        hand.hold = None
        if hold is None or not hold.confirmed:
            return []  # never counted as a pickup, so nothing to end
        hold_s = round(hold.last_seen - hold.start, 1)
        back_on_shelf = hand.last_in_zone is not None and hand.last_in_zone >= hold.last_seen - PUT_BACK_WINDOW_S
        if self.presentation:
            return [Event("put_back", hold.last_seen, hold.sku, hold.zone, self.camera, hold_s=hold_s)]  # put down
        kind = "put_back" if back_on_shelf else "taken"
        return [Event(kind, hold.last_seen, hold.sku, hand.last_zone if back_on_shelf else hold.zone, self.camera, hold_s=hold_s)]
