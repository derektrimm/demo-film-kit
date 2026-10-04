using UnityEngine;

namespace TrailerKit.Sample
{
    /// <summary>The sample's own gameplay camera: behind and above its target, easing after it.</summary>
    public sealed class SampleFollowCamera : MonoBehaviour
    {
        public Transform target;
        public Vector3 offset = new(0, 3.2f, -7f);
        public float lag = .2f;

        void LateUpdate()
        {
            if (!target) return;
            var want = target.position + target.rotation * offset;
            transform.position = Vector3.Lerp(transform.position, want, 1 - Mathf.Exp(-Time.deltaTime / lag));
            transform.rotation = Quaternion.LookRotation(target.position + Vector3.up - transform.position);
        }
    }
}
