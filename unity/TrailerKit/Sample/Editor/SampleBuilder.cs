using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace TrailerKit.Sample.Editor
{
    /// <summary>
    /// Builds the sample scene and a player of it, to try the whole pipeline before pointing it at a game.
    /// Menu: Tools > Trailer Kit > Build Sample Player. Batch: <c>-executeMethod TrailerKit.Sample.Editor.SampleBuilder.Build</c>.
    /// The player lands in Builds/TrailerSample/ next to Assets.
    /// </summary>
    public static class SampleBuilder
    {
        const string ScenePath = "Assets/TrailerKitSample/TrailerSample.unity";

        [MenuItem("Tools/Trailer Kit/Build Sample Player")]
        public static void Build()
        {
            MakeScene();
            var target = EditorUserBuildSettings.activeBuildTarget;
            string name = target switch
            {
                BuildTarget.StandaloneWindows64 => "TrailerSample.exe",
                BuildTarget.StandaloneOSX => "TrailerSample.app",
                _ => "TrailerSample",
            };
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = Path.Combine("Builds", "TrailerSample", name),
                target = target,
                options = BuildOptions.None,
            });
            Debug.Log($"TRAILER_SAMPLE_BUILD {report.summary.result} {Path.GetFullPath(report.summary.outputPath)}");
            if (Application.isBatchMode) EditorApplication.Exit(report.summary.result == UnityEditor.Build.Reporting.BuildResult.Succeeded ? 0 : 1);
        }

        static void MakeScene()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.55f, .62f, .75f);
            RenderSettings.ambientEquatorColor = new Color(.42f, .40f, .38f);
            RenderSettings.ambientGroundColor = new Color(.18f, .16f, .14f);

            var sun = new GameObject("Sun").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.intensity = 1.2f;
            sun.color = new Color(1f, .93f, .82f);
            sun.shadows = LightShadows.Soft;
            sun.transform.rotation = Quaternion.Euler(38, -35, 0);

            var ground = Shape(PrimitiveType.Plane, "Ground", Vector3.zero, new Vector3(40, 1, 40), new Color(.32f, .42f, .30f));
            for (int i = 0; i < 12; i++)
            {
                float a = i * 30f * Mathf.Deg2Rad, h = 2.5f + 1.5f * Mathf.Sin(i * 1.7f);
                var color = Color.HSVToRGB(i / 12f, .55f, .9f);
                Shape(PrimitiveType.Cube, $"Pillar {i + 1:D2}", new Vector3(Mathf.Sin(a) * 14, h / 2, Mathf.Cos(a) * 14), new Vector3(1.4f, h, 1.4f), color);
            }

            var runner = Shape(PrimitiveType.Capsule, "Runner", new Vector3(0, 1, 9), Vector3.one, new Color(.95f, .55f, .2f));
            Object.DestroyImmediate(runner.GetComponent<Collider>());
            runner.AddComponent<SampleRunner>();
            var visor = Shape(PrimitiveType.Cube, "Visor", Vector3.zero, new Vector3(.7f, .25f, .3f), new Color(.15f, .2f, .3f));
            Object.DestroyImmediate(visor.GetComponent<Collider>());
            visor.transform.SetParent(runner.transform, false);
            visor.transform.localPosition = new Vector3(0, .45f, .4f);

            var ball = Shape(PrimitiveType.Sphere, "Ball", new Vector3(0, .6f, 0), Vector3.one * 1.2f, new Color(.92f, .92f, .95f));
            var body = ball.AddComponent<Rigidbody>();
            body.interpolation = RigidbodyInterpolation.Interpolate;
            body.mass = 2;
#if UNITY_6000_0_OR_NEWER
            var bouncy = new PhysicsMaterial("Bouncy") { bounciness = .72f, bounceCombine = PhysicsMaterialCombine.Maximum };
#else
            var bouncy = new PhysicMaterial("Bouncy") { bounciness = .72f, bounceCombine = PhysicMaterialCombine.Maximum };
#endif
            AssetDatabase.CreateAsset(bouncy, $"{Path.GetDirectoryName(ScenePath)}/Bouncy.asset");
            ball.GetComponent<Collider>().sharedMaterial = bouncy;
            var source = ball.AddComponent<AudioSource>();
            source.spatialBlend = 1;
            source.playOnAwake = false;
            ball.AddComponent<SampleBall>().bounce = AssetDatabase.LoadAssetAtPath<AudioClip>(AudioPath());

            var camera = new GameObject("Main Camera") { tag = "MainCamera" };
            camera.AddComponent<Camera>().fieldOfView = 55;
            camera.AddComponent<AudioListener>();
            camera.AddComponent<SampleFollowCamera>().target = runner.transform;
            camera.transform.SetPositionAndRotation(new Vector3(0, 4, 2), Quaternion.Euler(15, 180, 0));

            EditorSceneManager.SaveScene(scene, ScenePath);
            Debug.Log($"TRAILER_SAMPLE_SCENE {ScenePath}");
        }

        // The bounce sound ships in the kit's Sample/Audio folder, wherever the kit was copied in.
        static string AudioPath() => AssetDatabase.FindAssets("bounce t:AudioClip").Select(AssetDatabase.GUIDToAssetPath)
            .FirstOrDefault(p => p.Replace('\\', '/').Contains("TrailerKit/Sample/Audio/"));

        static GameObject Shape(PrimitiveType type, string name, Vector3 position, Vector3 scale, Color color)
        {
            var go = GameObject.CreatePrimitive(type);
            go.name = name;
            go.transform.position = position;
            go.transform.localScale = scale;
            var renderer = go.GetComponent<Renderer>();
            var material = new Material(renderer.sharedMaterial) { color = color };
            // Matte, so the sun leaves no hot spot: the built-in Standard shader and URP Lit name it differently.
            foreach (var smoothness in new[] { "_Glossiness", "_Smoothness" })
                if (material.HasProperty(smoothness)) material.SetFloat(smoothness, .15f);
            AssetDatabase.CreateAsset(material, $"{Path.GetDirectoryName(ScenePath)}/{name}.mat");
            renderer.sharedMaterial = material;
            return go;
        }
    }
}
