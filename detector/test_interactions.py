"""Tests for interactions.py. Run: python -m unittest detector/test_interactions.py"""

import unittest

from interactions import HandSighting, InteractionTracker

FPS = 10


class Scene:
    """Feeds a tracker one frame at a time, like the camera would."""

    def __init__(self, presentation=False):
        self.tracker = InteractionTracker("cam1", presentation=presentation)
        self.t = 1000.0
        self.events = []

    def frames(self, seconds, *hands):
        """hands: (person, side, sku, zone) for every hand visible in these frames."""
        for _ in range(int(seconds * FPS)):
            self.t += 1 / FPS
            self.events += self.tracker.update(self.t, [HandSighting(*h) for h in hands])

    def types(self):
        return [e.type for e in self.events]


class InteractionTests(unittest.TestCase):
    def test_pickup_then_put_back(self):
        s = Scene()
        s.frames(1, (1, "R", None, "R2"))  # reaching into the rack
        s.frames(0.5, (1, "R", "NEW-201", "R2"))  # gripping the shirt
        s.frames(5, (1, "R", "NEW-201", None))  # holding it up, away from the rack
        self.assertEqual(s.tracker.held_by_zone(), {"R2": ["NEW-201"]})
        s.frames(0.5, (1, "R", "NEW-201", "R2"))  # back to the rack
        s.frames(3, (1, "R", None, "R2"))  # hand empty again
        self.assertEqual(s.types(), ["pickup", "put_back"])
        put_back = s.events[1]
        self.assertEqual((put_back.sku, put_back.zone), ("NEW-201", "R2"))
        self.assertAlmostEqual(put_back.hold_s, 5.8, delta=0.5)
        self.assertEqual(s.tracker.held_by_zone(), {})

    def test_worn_clothes_are_ignored(self):
        s = Scene()
        s.frames(10, (1, "L", "KRT-301", None))  # never near a shelf: someone wearing the kurta
        self.assertEqual(s.events, [])

    def test_shopper_leaves_with_product(self):
        s = Scene()
        s.frames(0.5, (1, "R", None, "R1"))
        s.frames(4, (1, "R", "DNM-101", None))
        s.frames(3)  # the shopper walks out of view
        self.assertEqual(s.types(), ["pickup", "taken"])
        self.assertEqual(s.events[1].zone, "R1")

    def test_brushing_past_a_shelved_product_is_not_a_pickup(self):
        s = Scene()
        s.frames(0.6, (1, "R", "ACC-501", "R5"))  # hand over the tote on the shelf, never lifts it
        s.frames(3, (1, "R", None, "R5"))
        self.assertEqual(s.events, [])

    def test_two_products_are_compared_once(self):
        s = Scene()
        s.frames(0.5, (1, "L", None, "R3"), (1, "R", None, "R3"))
        s.frames(3, (1, "L", "KRT-301", None), (1, "R", "KRT-302", None))
        s.frames(3, (1, "L", "KRT-301", None), (1, "R", "KRT-302", None))
        self.assertEqual(s.types().count("pickup"), 2)
        self.assertEqual(s.types().count("compare"), 1)
        compare = next(e for e in s.events if e.type == "compare")
        self.assertEqual({compare.sku, compare.other_sku}, {"KRT-301", "KRT-302"})
        self.assertEqual(s.tracker.held_by_zone(), {"R3": ["KRT-301", "KRT-302"]})

    def test_presentation_mode_needs_no_zone(self):
        s = Scene(presentation=True)
        s.frames(2, (1, "R", "WIN-401", None))
        s.frames(3, (1, "R", None, None))
        self.assertEqual(s.types(), ["pickup", "put_back"])
        self.assertEqual(s.events[0].zone, "any")

    def test_flicker_does_not_end_a_hold(self):
        s = Scene()
        s.frames(0.5, (1, "R", None, "R2"))
        s.frames(2, (1, "R", "NEW-202", None))
        s.frames(0.8, (1, "R", None, None))  # recogniser misses the tee for under a second
        s.frames(2, (1, "R", "NEW-202", None))
        s.frames(3)
        self.assertEqual(s.types(), ["pickup", "taken"])


if __name__ == "__main__":
    unittest.main()
