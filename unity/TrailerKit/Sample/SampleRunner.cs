using UnityEngine;

namespace TrailerKit.Sample
{
    /// <summary>The sample's player stand-in: runs a circle around the arena, facing where it goes.</summary>
    public sealed class SampleRunner : MonoBehaviour
    {
        public float radius = 9f, speed = 5f;
        public float angle;

        void Update()
        {
            angle += speed / radius * Mathf.Rad2Deg * Time.deltaTime;
            float a = angle * Mathf.Deg2Rad;
            transform.SetPositionAndRotation(new Vector3(Mathf.Sin(a) * radius, 1f, Mathf.Cos(a) * radius), Quaternion.Euler(0, angle + 90, 0));
        }
    }
}
