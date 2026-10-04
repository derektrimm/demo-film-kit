using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace TrailerKit
{
    /// <summary>
    /// Films a shot list from a built player at a locked frame rate: <c>Player -trailer plan.json</c>.
    /// Every shot is the running game. The director only decides where things start and where the camera is:
    /// the game's own camera ("play"), or a director's camera placed in the world ("world") or around a moving
    /// object ("subject"). Frames stream as raw RGB24, bottom row first, to the plan's <c>output</c> (a FIFO
    /// that ffmpeg reads); with <c>stillsDir</c> set, PNGs are written at fractions of each shot instead.
    /// <c>manifest.txt</c> records the frame each shot starts on, <c>sounds.txt</c> every sound the game
    /// reports through <see cref="Sound"/>, and <c>probe.txt</c> the anchors shots are authored against.
    /// The game connects through the static hooks below; none is required.
    /// </summary>
    [DefaultExecutionOrder(10000)]
    public sealed class TrailerDirector : MonoBehaviour
    {
        /// <summary>The command-line switch that turns the director on. The next argument is the plan.</summary>
        public const string Flag = "-trailer";

        /// <summary>Gets the game into play: load the level, skip the title screen, spawn the player. Runs before the
        /// first shot and again before any shot with <c>reload</c> set. Without it the director films the scene the
        /// player booted into.</summary>
        public static Func<IEnumerator> Begin;

        /// <summary>Sets up the actors for a shot before its preroll: place the player, start an autopilot, reset a
        /// level. <see cref="Shot.action"/>, <see cref="Shot.at"/> and <see cref="Shot.yaw"/> are free for the game.</summary>
        public static Action<Shot> Setup;

        /// <summary>The game's own camera, filmed by "play" shots and copied for the director's camera.
        /// Defaults to <c>Camera.main</c>.</summary>
        public static Func<Camera> PlayCamera;

        /// <summary>Extra state appended to a shot's manifest line after it is filmed (where the player ended up,
        /// whether a run failed).</summary>
        public static Func<Shot, string> Report;

        /// <summary>Anchor lines for <c>probe.txt</c>: spawn points, objects worth framing, their positions.</summary>
        public static Func<IEnumerable<string>> Probe;

        [Serializable]
        public sealed class Plan
        {
            public int width, height, fps;
            public string output, stillsDir, only;
            public float[] stillAt;
            public float settle;
            public int keepInterface;
            public Shot[] shots;
        }

        /// <summary>One shot. Positions are float triples in the shot's <c>space</c>: "world" (scene metres),
        /// "subject" (around <c>subject</c>, turning with its heading), or "play" (the game's camera; no camera
        /// fields). Absent numbers read as zero, so every default is chosen to be zero.</summary>
        [Serializable]
        public sealed class Shot
        {
            public string name;
            public float duration, preroll, timeScale;
            public int reload;
            public string space, subject, look, ease;
            public float[] camFrom, camTo, lookFrom, lookTo;
            public float fovFrom, fovTo, followLag, shake, roll;
            public string action;
            public float[] at;
            public float yaw;
        }

        static TrailerDirector instance;

        Plan plan;
        Camera play, director, active;
        RenderTexture target;
        Texture2D readback;
        FileStream sink;
        StreamWriter sounds;
        string root;
        int written;
        readonly List<string> manifest = new();

        Shot shot;
        Transform subject;
        float progress, fixedStep;
        bool rolling, failed;
        Vector3 pivot;
        float pivotYaw;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Install()
        {
            if (Array.IndexOf(Environment.GetCommandLineArgs(), Flag) < 0 || instance != null)
                return;
            var go = new GameObject("Trailer director");
            DontDestroyOnLoad(go);
            instance = go.AddComponent<TrailerDirector>();
        }

        /// <summary>Reports a sound the game played, for the trailer to lay the game's own audio where it happened.
        /// Call it from the game's audio code: an id, the clip (its name finds the file), where it played (null for a
        /// 2D sound) and its volume.</summary>
        public static void Sound(string id, AudioClip clip, Vector3? position, float volume)
        {
            var d = instance;
            if (d == null || !d.rolling || d.sounds == null || clip == null) return;
            float distance = position.HasValue && d.active ? Vector3.Distance(position.Value, d.active.transform.position) : 0f;
            d.sounds.WriteLine($"{d.written} {id} {clip.name} {volume:F3} {distance:F2}");
        }

        /// <summary>Stops filming with a reason in the log; film.sh reports it. For hooks that find the game in a
        /// state a shot cannot start from.</summary>
        public static void Fail(string reason)
        {
            Debug.LogError("TRAILER_FAILED " + reason);
            if (instance != null) instance.failed = true;
            Application.Quit(1);
        }

        IEnumerator Start()
        {
            Application.runInBackground = true;
            var args = Environment.GetCommandLineArgs();
            int index = Array.IndexOf(args, Flag);
            if (index + 1 >= args.Length || !File.Exists(args[index + 1])) { Fail($"plan missing: {Flag} <plan.json>"); yield break; }
            plan = JsonUtility.FromJson<Plan>(File.ReadAllText(args[index + 1]));
            if (plan.width <= 0) plan.width = 1920;
            if (plan.height <= 0) plan.height = 1080;
            if (plan.fps <= 0) plan.fps = 60;
            if (plan.shots == null || plan.shots.Length == 0) { Fail("the plan has no shots"); yield break; }
            bool stills = !string.IsNullOrEmpty(plan.stillsDir);
            if (!stills && string.IsNullOrEmpty(plan.output)) { Fail("the plan needs output (a FIFO) or stillsDir"); yield break; }
            root = stills ? plan.stillsDir : Path.GetDirectoryName(Path.GetFullPath(plan.output));
            Directory.CreateDirectory(root);

            yield return Enter();
            if (failed) yield break;
            target = new RenderTexture(plan.width, plan.height, 24, RenderTextureFormat.ARGB32, RenderTextureReadWrite.sRGB);
            target.Create();
            readback = new Texture2D(plan.width, plan.height, TextureFormat.RGB24, false);
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = -1;
            WriteProbe();
            if (!stills)
            {
                // Opening a FIFO for writing waits until its reader (ffmpeg) has opened it.
                sink = new FileStream(plan.output, FileMode.Open, FileAccess.Write, FileShare.ReadWrite, 1 << 22);
                sounds = new StreamWriter(Path.Combine(root, "sounds.txt"));
            }
            // Let streaming, shader warm-up and the first physics settle before anything is filmed.
            yield return new WaitForSecondsRealtime(plan.settle > 0 ? plan.settle : 1.5f);

            fixedStep = Time.fixedDeltaTime;
            // The clock advances exactly one frame per rendered frame, however long a frame takes to render.
            Time.captureFramerate = plan.fps;
            var only = string.IsNullOrEmpty(plan.only) ? null : new HashSet<string>(plan.only.Split(',').Select(s => s.Trim()));
            if (only != null && only.Except(plan.shots.Select(s => s.name)).FirstOrDefault() is string unknown) { Fail($"no shot named {unknown}"); yield break; }
            foreach (var next in plan.shots)
            {
                if (only != null && !only.Contains(next.name)) continue;
                yield return Film(next);
                if (failed) yield break;
            }
            Time.captureFramerate = 0;
            Time.timeScale = 1;
            Time.fixedDeltaTime = fixedStep;
            File.WriteAllLines(Path.Combine(root, "manifest.txt"), manifest);
            sounds?.Dispose();
            sounds = null;
            sink?.Flush();
            sink?.Dispose();
            sink = null;
            Debug.Log("TRAILER_OK frames=" + written);
            Application.Quit(0);
        }

        // Runs the game's Begin hook, then finds the cameras.
        IEnumerator Enter()
        {
            if (Begin != null) yield return Begin();
            yield return null;
            play = PlayCamera != null ? PlayCamera() : Camera.main;
            if (play == null) { Fail("no camera to film: set TrailerDirector.PlayCamera or tag the game camera MainCamera"); yield break; }
            if (director == null) director = CopyCamera(play);
        }

        // The director's camera is a copy of the game's: the same culling, clear and render-pipeline settings
        // (post-processing included), with none of the game's camera scripts.
        static Camera CopyCamera(Camera source)
        {
            var go = new GameObject("Trailer camera");
            DontDestroyOnLoad(go);
            go.transform.SetPositionAndRotation(source.transform.position, source.transform.rotation);
            var camera = go.AddComponent<Camera>();
            camera.CopyFrom(source);
            camera.targetTexture = null;
            camera.enabled = false;
            // URP's UniversalAdditionalCameraData and HDRP's HDAdditionalCameraData hold the post-processing and
            // renderer settings; copied field by field, without a compile-time reference to either pipeline.
            foreach (var data in source.GetComponents<MonoBehaviour>().Where(c => c != null && c.GetType().Name.EndsWith("AdditionalCameraData")))
            {
                var copy = go.GetComponent(data.GetType()) ?? go.AddComponent(data.GetType());
                JsonUtility.FromJsonOverwrite(JsonUtility.ToJson(data), copy);
            }
            return camera;
        }

        IEnumerator Film(Shot next)
        {
            shot = next;
            if (shot.reload != 0)
            {
                rolling = false;
                yield return Enter();
                if (failed) yield break;
            }
            Time.timeScale = shot.timeScale > 0 ? shot.timeScale : 1;
            // Physics steps once per filmed frame, in proportion in slow motion, so moving bodies never judder.
            Time.fixedDeltaTime = Mathf.Min(fixedStep, 1f / plan.fps) * Time.timeScale;
            Setup?.Invoke(shot);
            if (failed) yield break;
            if (plan.keepInterface == 0) HideInterface();
            subject = null;
            if (!string.IsNullOrEmpty(shot.subject))
            {
                var found = GameObject.Find(shot.subject);
                if (found == null) { Fail($"{shot.name}: no active object named {shot.subject}"); yield break; }
                subject = found.transform;
                pivot = subject.position;
                pivotYaw = subject.eulerAngles.y;
            }
            else if (shot.space == "subject" || shot.look == "subject") { Fail($"{shot.name}: space or look is subject, but no subject is named"); yield break; }
            bool own = shot.space == "play";
            director.enabled = !own;
            director.targetTexture = own ? null : target;
            play.targetTexture = own ? target : null;
            if (own) play.enabled = true;
            active = own ? play : director;
            Physics.SyncTransforms();

            int prerollFrames = Mathf.RoundToInt(shot.preroll * plan.fps);
            int frames = Mathf.Max(1, Mathf.RoundToInt(shot.duration * plan.fps));
            var stillAt = plan.stillAt != null && plan.stillAt.Length > 0 ? plan.stillAt : new[] { 0f, .5f, .99f };
            var stillFrames = new HashSet<int>(stillAt.Select(f => Mathf.Clamp(Mathf.RoundToInt(f * (frames - 1)), 0, frames - 1)));
            int first = written;
            for (int frame = -prerollFrames; frame < frames; frame++)
            {
                // LateUpdate places the director's camera before this frame renders; the read takes the finished frame.
                progress = Mathf.Clamp01(frame / (float)Mathf.Max(1, frames - 1));
                rolling = frame >= 0;
                yield return new WaitForEndOfFrame();
                if (frame < 0) continue;
                if (sink != null) { Read(); sink.Write(readback.GetRawTextureData<byte>().AsReadOnlySpan()); written++; }
                else if (stillFrames.Contains(frame)) { Read(); File.WriteAllBytes(Path.Combine(root, $"{shot.name}-{frame:D4}.png"), readback.EncodeToPNG()); }
            }
            rolling = false;
            play.targetTexture = null;
            director.targetTexture = null;
            string extra = Report != null ? " " + Report(shot) : "";
            manifest.Add($"{shot.name} first={first} frames={(sink != null ? written - first : frames)}{extra}");
            Debug.Log("TRAILER_SHOT " + manifest[^1]);
        }

        static void HideInterface()
        {
            foreach (var document in FindObjectsByType<UIDocument>(FindObjectsSortMode.None))
                if (document.rootVisualElement != null) document.rootVisualElement.style.display = DisplayStyle.None;
            foreach (var canvas in FindObjectsByType<Canvas>(FindObjectsSortMode.None))
                if (canvas.isRootCanvas) canvas.enabled = false;
        }

        void LateUpdate()
        {
            if (shot == null || failed || shot.space == "play" || director == null || play == null) return;
            Aim(progress);
        }

        void Aim(float t)
        {
            float e = Ease(t);
            if (shot.space == "subject" && subject != null)
            {
                // A smoothed frame that follows the subject, so the camera glides instead of copying every bump.
                float lag = shot.followLag > 0 ? shot.followLag : .25f;
                float k = 1 - Mathf.Exp(-Time.deltaTime / Mathf.Max(.0001f, Time.timeScale) / lag);
                pivot = Vector3.Lerp(pivot, subject.position, k);
                pivotYaw = Mathf.LerpAngle(pivotYaw, subject.eulerAngles.y, k);
            }
            var position = Place(Lerp(shot.camFrom, shot.camTo, e));
            var offset = Has(shot.lookFrom) ? Lerp(shot.lookFrom, shot.lookTo, e) : Vector3.zero;
            // A rigidbody's transform is its interpolated, rendered position: aim at that, never at Rigidbody.position.
            Vector3 look = shot.look switch
            {
                "subject" => subject.position + offset,
                null or "" => Place(offset),
                _ => (GameObject.Find(shot.look) is GameObject named ? named.transform.position : Place(Vector3.zero)) + offset,
            };
            if (shot.shake > 0)
            {
                float s = Time.time;
                position += new Vector3(Mathf.PerlinNoise(s * .7f, 1) - .5f, Mathf.PerlinNoise(s * .6f, 5) - .5f, Mathf.PerlinNoise(s * .5f, 9) - .5f) * shot.shake;
            }
            var forward = look - position;
            if (forward.sqrMagnitude < 1e-8f) forward = director.transform.forward;
            director.transform.SetPositionAndRotation(position, Quaternion.LookRotation(forward) * Quaternion.Euler(0, 0, shot.roll));
            float fovFrom = shot.fovFrom > 0 ? shot.fovFrom : 50, fovTo = shot.fovTo > 0 ? shot.fovTo : fovFrom;
            director.fieldOfView = Mathf.Lerp(fovFrom, fovTo, e);
        }

        Vector3 Place(Vector3 v) => shot.space == "subject" ? pivot + Quaternion.Euler(0, pivotYaw, 0) * v : v;

        void Read()
        {
            var previous = RenderTexture.active;
            RenderTexture.active = target;
            readback.ReadPixels(new Rect(0, 0, plan.width, plan.height), 0, 0, false);
            readback.Apply(false);
            RenderTexture.active = previous;
        }

        float Ease(float t) => shot.ease switch
        {
            "inout" => t * t * (3 - 2 * t),
            "out" => 1 - (1 - t) * (1 - t),
            "in" => t * t,
            "slow" => Mathf.Lerp(t, t * t * (3 - 2 * t), .5f),
            _ => t,
        };

        static bool Has(float[] a) => a != null && a.Length >= 3;
        static Vector3 V(float[] a) => new(a[0], a[1], a[2]);
        static Vector3 Lerp(float[] a, float[] b, float t)
        {
            if (!Has(a)) return Vector3.zero;
            return Has(b) ? Vector3.Lerp(V(a), V(b), t) : V(a);
        }

        void WriteProbe()
        {
            var lines = new List<string> { $"camera {play.transform.position} {play.transform.eulerAngles} fov {play.fieldOfView}" };
            if (Probe != null) lines.AddRange(Probe());
            File.WriteAllLines(Path.Combine(root, "probe.txt"), lines);
        }

        void OnDestroy()
        {
            sounds?.Dispose();
            sink?.Dispose();
            if (play) play.targetTexture = null;
            if (director) director.targetTexture = null;
            if (target) target.Release();
            if (instance == this) instance = null;
        }
    }
}
