import { useState } from 'react'
import { setVoiceEnabled, speak, speechSupported, voiceEnabled } from '../engine/speech'

/** Opt-in checkbox for voice announcements; hidden when the browser has no speech. */
export function VoiceToggle() {
  const [on, setOn] = useState(voiceEnabled)
  if (!speechSupported()) return null
  return (
    <label className="voice-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          setVoiceEnabled(e.target.checked)
          setOn(e.target.checked)
          // Sample doubles as the iOS gesture-unlock for speech.
          if (e.target.checked) speak('Voice announcements on')
        }}
      />
      Voice announcements
    </label>
  )
}
