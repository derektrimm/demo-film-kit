using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace TrailerKit.Sample
{
    /// <summary>
    /// How a game connects to the director. The sample needs no Begin (it boots into play) and films Camera.main;
    /// it sets up one action ("drop": the ball falls from <c>at</c>), reports the runner's position after each
    /// shot, and lists its anchors for probe.txt. A game puts the same in its own code.
    /// </summary>
    static class SampleTrailerHooks
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
        static void Connect()
        {
            TrailerDirector.Setup = shot =>
            {
                if (shot.action != "drop") return;
                var ball = Object.FindAnyObjectByType<SampleBall>();
                if (ball == null || shot.at == null || shot.at.Length < 3) { TrailerDirector.Fail($"{shot.name}: drop needs the ball and at"); return; }
                ball.Drop(new Vector3(shot.at[0], shot.at[1], shot.at[2]));
            };
            TrailerDirector.Report = _ => $"runner={Object.FindAnyObjectByType<SampleRunner>()?.transform.position}";
            TrailerDirector.Probe = () => new List<string> { $"runner {Object.FindAnyObjectByType<SampleRunner>()?.transform.position}" }
                .Concat(Object.FindObjectsByType<Transform>(FindObjectsSortMode.None).Where(t => t.name.StartsWith("Pillar")).OrderBy(t => t.name)
                    .Select(t => $"{t.name} {t.position}"));
        }
    }
}
