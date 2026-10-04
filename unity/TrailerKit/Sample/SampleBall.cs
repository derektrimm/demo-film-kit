using UnityEngine;

namespace TrailerKit.Sample
{
    /// <summary>A bouncing ball that plays a sound on every hit and reports it to the director.</summary>
    [RequireComponent(typeof(Rigidbody), typeof(AudioSource))]
    public sealed class SampleBall : MonoBehaviour
    {
        public AudioClip bounce;

        void OnCollisionEnter(Collision collision)
        {
            float volume = Mathf.Clamp01(collision.relativeVelocity.magnitude / 12f);
            if (volume < .05f) return;
            GetComponent<AudioSource>().PlayOneShot(bounce, volume);
            TrailerDirector.Sound("bounce", bounce, transform.position, volume);
        }

        public void Drop(Vector3 at)
        {
            var body = GetComponent<Rigidbody>();
            body.position = at;
            transform.position = at;
#if UNITY_6000_0_OR_NEWER
            body.linearVelocity = Vector3.zero;
#else
            body.velocity = Vector3.zero;
#endif
            body.angularVelocity = Vector3.zero;
        }
    }
}
