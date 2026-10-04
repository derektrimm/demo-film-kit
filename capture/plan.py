#!/usr/bin/env python3
"""The shot list, written as the plan the director films.

    python3 capture/plan.py film   [--only a,b]   -> capture/plan-film.json   (frames to capture/frames.fifo)
    python3 capture/plan.py stills [--only a,b]   -> capture/plan-stills.json (PNGs in capture/stills/)

These shots film the sample scene (unity/TrailerKit/Sample). Replace them with your game's. Coordinates are
scene metres; probe.txt, written on every run, lists the anchors to author against. Shots are filmed in the
order listed and state carries from one to the next, so list them in the order the game can play them, not
the order the trailer shows them.
"""
import argparse
import json
from pathlib import Path

SHOTS = []


def shot(**k):
    SHOTS.append(k)


# A crane down over the arena: a beauty shot, held long enough to look at.
shot(name="establish", duration=6, space="world", camFrom=[22, 13, -22], camTo=[17, 8, -17], lookFrom=[0, 1, 0], fovFrom=45, ease="slow")
# Around a moving subject: behind and to one side, turning with it.
shot(name="follow", duration=4.5, space="subject", subject="Runner", camFrom=[2.6, 1.4, -5], camTo=[2.0, 1.2, -4], look="subject", lookFrom=[0, 0.3, 2], fovFrom=50)
# The game's own camera, exactly as a player sees it.
shot(name="play", duration=4, space="play")
shot(name="side", duration=4, space="subject", subject="Runner", camFrom=[6, 1.0, -1], camTo=[6, 1.3, 2], look="subject", fovFrom=42)
# A game action set up by the game's Setup hook: the ball falls from `at`.
shot(name="drop", duration=3.5, action="drop", at=[0, 7, 0], space="world", camFrom=[9, 2.2, 9], camTo=[8, 2.0, 8], lookFrom=[0, 2.2, 0], fovFrom=44)
# The same moment in slow motion: physics still steps once per filmed frame.
shot(name="drop-slow", duration=5, timeScale=0.35, action="drop", at=[0, 4, 0], space="world", camFrom=[3.0, 0.4, 3.2], camTo=[2.7, 0.45, 2.9], lookFrom=[0, 1.1, 0], fovFrom=38)
# The title rides on a crane up and away.
shot(name="title", duration=7, space="world", camFrom=[4, 2, -12], camTo=[0, 16, -26], lookFrom=[0, 1, 0], lookTo=[0, 3, 0], fovFrom=48, fovTo=44, ease="slow")


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("mode", choices=["film", "stills"])
    parser.add_argument("--only", help="comma-separated shot names (state carries across shots, so keep a sequence whole)")
    args = parser.parse_args()
    here = Path(__file__).resolve().parent
    names = [s["name"] for s in SHOTS]
    if len(set(names)) != len(names):
        parser.error("shot names must be unique")
    if args.only:
        unknown = set(args.only.split(",")) - set(names)
        if unknown:
            parser.error(f"unknown shots: {', '.join(sorted(unknown))}")
    plan = dict(width=1920, height=1080, fps=60, shots=SHOTS)
    if args.mode == "film":
        plan["output"] = str(here / "frames.fifo")
    else:
        plan.update(stillsDir=str(here / "stills"), stillAt=[0.0, 0.5, 0.99])
    if args.only:
        plan["only"] = args.only
    out = here / f"plan-{args.mode}.json"
    out.write_text(json.dumps(plan, indent=1) + "\n")
    print(f"{out}: {len(SHOTS)} shots, {sum(s['duration'] for s in SHOTS):.1f} s")


if __name__ == "__main__":
    main()
